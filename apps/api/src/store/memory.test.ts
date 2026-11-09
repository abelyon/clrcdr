import { describe, expect, it } from 'vitest';
import { silentLogger } from '../lib/logger';
import { MemoryStore } from './memory';
import { createStore } from './resilient';

describe('MemoryStore', () => {
  it('supports ttl, nx and delete', async () => {
    let now = 0;
    const s = new MemoryStore(() => now);
    await s.set('k', 'v', 10);
    expect(await s.get('k')).toBe('v');
    expect(await s.setNx('k', 'x')).toBe(false);
    now = 11_000;
    expect(await s.get('k')).toBeNull();
    expect(await s.setNx('k', 'x')).toBe(true);
    await s.del('k');
    expect(await s.get('k')).toBeNull();
  });

  it('orders sorted sets like ZREVRANGE', async () => {
    const s = new MemoryStore();
    await s.zadd('z', 10, 'a');
    await s.zadd('z', 30, 'b');
    await s.zincrby('z', 15, 'a');
    await s.zadd('z', 5, 'c');
    expect(await s.zrevrange('z', 0, 1)).toEqual([
      { member: 'b', score: 30 },
      { member: 'a', score: 25 },
    ]);
    expect(await s.zrevrank('z', 'c')).toBe(2);
    expect(await s.zrevrank('z', 'nope')).toBeNull();
    expect(await s.zcard('z')).toBe(3);
    expect(await s.zrevrange('z', 0, -1)).toHaveLength(3);
  });

  it('supports hashes and lists', async () => {
    const s = new MemoryStore();
    await s.hset('h', 'a', '1');
    expect(await s.hget('h', 'a')).toBe('1');
    expect(await s.hmget('h', ['a', 'b'])).toEqual(['1', null]);
    await s.rpush('l', 'x');
    await s.rpush('l', 'y');
    expect(await s.llen('l')).toBe(2);
    expect(await s.lrem('l', 'x')).toBe(1);
    expect(await s.lrange('l', 0, -1)).toEqual(['y']);
  });
});

describe('MemoryStore.sweep', () => {
  it('removes expired keys only', async () => {
    let now = 0;
    const s = new MemoryStore(() => now);
    await s.set('a', '1', 1);
    await s.set('b', '2');
    now = 5000;
    expect(s.sweep()).toBe(1);
    expect(await s.get('b')).toBe('2');
  });
});

describe('createStore fallback', () => {
  it('serves from memory when no Redis URL is configured', async () => {
    const store = await createStore({ url: '', logger: silentLogger });
    expect(store.mode).toBe('memory');
    await store.set('k', 'v');
    expect(await store.get('k')).toBe('v');
    await store.close();
  });

  it('degrades to memory when Redis is unreachable and never throws', async () => {
    const store = await createStore({ url: 'redis://127.0.0.1:1', logger: silentLogger, connectTimeoutMs: 400 });
    expect(store.mode).toBe('memory');
    await store.set('k', 'v', 30);
    expect(await store.get('k')).toBe('v');
    await store.zadd('z', 5, 'a');
    expect(await store.zrevrange('z', 0, 0)).toEqual([{ member: 'a', score: 5 }]);
    expect(await store.ping()).toBe(true);
    await store.close();
  });
});
