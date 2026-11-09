export interface ZEntry {
  member: string;
  score: number;
}

export type StoreMode = 'redis' | 'memory';

/** Minimal key/value, sorted-set, hash and list surface used by the API (Redis or in-memory). */
export interface Store {
  /** Backend currently serving requests. */
  readonly mode: StoreMode;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  setNx(key: string, value: string, ttlSec?: number): Promise<boolean>;
  del(...keys: string[]): Promise<void>;
  expire(key: string, ttlSec: number): Promise<void>;
  zadd(key: string, score: number, member: string): Promise<void>;
  zincrby(key: string, increment: number, member: string): Promise<number>;
  zrevrange(key: string, start: number, stop: number): Promise<ZEntry[]>;
  zrevrank(key: string, member: string): Promise<number | null>;
  zcard(key: string): Promise<number>;
  hset(key: string, field: string, value: string): Promise<void>;
  hget(key: string, field: string): Promise<string | null>;
  hmget(key: string, fields: string[]): Promise<(string | null)[]>;
  rpush(key: string, value: string): Promise<number>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
  lrem(key: string, value: string): Promise<number>;
  llen(key: string): Promise<number>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
