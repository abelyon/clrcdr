import type { Store, ZEntry } from './types';

interface Slot {
  value: unknown;
  expiresAt: number | null;
}

/** In-memory store with TTL support. Used when Redis is unconfigured or unreachable. */
export class MemoryStore implements Store {
  readonly mode = 'memory' as const;
  private readonly data = new Map<string, Slot>();

  constructor(private readonly now: () => number = Date.now) {}

  private read<T>(key: string): T | undefined {
    const slot = this.data.get(key);
    if (!slot) return undefined;
    if (slot.expiresAt !== null && slot.expiresAt <= this.now()) {
      this.data.delete(key);
      return undefined;
    }
    return slot.value as T;
  }

  private write(key: string, value: unknown, ttlSec?: number, keepTtl = false): void {
    const existing = this.data.get(key);
    const expiresAt =
      ttlSec !== undefined
        ? this.now() + ttlSec * 1000
        : keepTtl && existing
          ? existing.expiresAt
          : null;
    this.data.set(key, { value, expiresAt });
  }

  async get(key: string): Promise<string | null> {
    return this.read<string>(key) ?? null;
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    this.write(key, value, ttlSec);
  }

  async setNx(key: string, value: string, ttlSec?: number): Promise<boolean> {
    if (this.read(key) !== undefined) return false;
    this.write(key, value, ttlSec);
    return true;
  }

  async del(...keys: string[]): Promise<void> {
    for (const key of keys) this.data.delete(key);
  }

  async expire(key: string, ttlSec: number): Promise<void> {
    const slot = this.data.get(key);
    if (slot) slot.expiresAt = this.now() + ttlSec * 1000;
  }

  private zset(key: string): Map<string, number> {
    let z = this.read<Map<string, number>>(key);
    if (!z) {
      z = new Map();
      this.write(key, z, undefined, true);
    }
    return z;
  }

  async zadd(key: string, score: number, member: string): Promise<void> {
    this.zset(key).set(member, score);
  }

  async zincrby(key: string, increment: number, member: string): Promise<number> {
    const z = this.zset(key);
    const next = (z.get(member) ?? 0) + increment;
    z.set(member, next);
    return next;
  }

  private sorted(key: string): ZEntry[] {
    const z = this.read<Map<string, number>>(key);
    if (!z) return [];
    return [...z.entries()]
      .map(([member, score]) => ({ member, score }))
      .sort((a, b) => b.score - a.score || (a.member < b.member ? 1 : -1));
  }

  async zrevrange(key: string, start: number, stop: number): Promise<ZEntry[]> {
    const all = this.sorted(key);
    const end = stop < 0 ? all.length + stop + 1 : stop + 1;
    return all.slice(Math.max(0, start), Math.max(0, end));
  }

  async zrevrank(key: string, member: string): Promise<number | null> {
    const index = this.sorted(key).findIndex((e) => e.member === member);
    return index === -1 ? null : index;
  }

  async zcard(key: string): Promise<number> {
    return this.read<Map<string, number>>(key)?.size ?? 0;
  }

  private hash(key: string): Map<string, string> {
    let h = this.read<Map<string, string>>(key);
    if (!h) {
      h = new Map();
      this.write(key, h, undefined, true);
    }
    return h;
  }

  async hset(key: string, field: string, value: string): Promise<void> {
    this.hash(key).set(field, value);
  }

  async hget(key: string, field: string): Promise<string | null> {
    return this.read<Map<string, string>>(key)?.get(field) ?? null;
  }

  async hmget(key: string, fields: string[]): Promise<(string | null)[]> {
    const h = this.read<Map<string, string>>(key);
    return fields.map((f) => h?.get(f) ?? null);
  }

  private list(key: string): string[] {
    let l = this.read<string[]>(key);
    if (!l) {
      l = [];
      this.write(key, l, undefined, true);
    }
    return l;
  }

  async rpush(key: string, value: string): Promise<number> {
    const l = this.list(key);
    l.push(value);
    return l.length;
  }

  async lrange(key: string, start: number, stop: number): Promise<string[]> {
    const l = this.read<string[]>(key) ?? [];
    const end = stop < 0 ? l.length + stop + 1 : stop + 1;
    return l.slice(Math.max(0, start), Math.max(0, end));
  }

  async lrem(key: string, value: string): Promise<number> {
    const l = this.read<string[]>(key);
    if (!l) return 0;
    const index = l.indexOf(value);
    if (index === -1) return 0;
    l.splice(index, 1);
    return 1;
  }

  async llen(key: string): Promise<number> {
    return this.read<string[]>(key)?.length ?? 0;
  }

  /** Drops expired entries; reads already ignore them, this only reclaims memory. */
  sweep(): number {
    const now = this.now();
    let removed = 0;
    for (const [key, slot] of this.data) {
      if (slot.expiresAt !== null && slot.expiresAt <= now) {
        this.data.delete(key);
        removed++;
      }
    }
    return removed;
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    this.data.clear();
  }
}
