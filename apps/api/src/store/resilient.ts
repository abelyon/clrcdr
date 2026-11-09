import { Redis } from 'ioredis';
import { isRailwayInternalUrl, resolveRedisUrl } from '@mastermind/shared';
import type { Logger } from '../lib/logger';
import { MemoryStore } from './memory';
import type { Store, StoreMode, ZEntry } from './types';

/**
 * Redis-first store that degrades to memory: while Redis is not ready (or a command fails) the
 * same operation runs against an in-process MemoryStore, so the API never crashes on Redis outages.
 */
export class ResilientStore implements Store {
  private readonly memory = new MemoryStore();
  private warnedAt = 0;

  constructor(
    private readonly redis: Redis | null,
    private readonly logger: Logger,
  ) {}

  get mode(): StoreMode {
    return this.redis && this.redis.status === 'ready' ? 'redis' : 'memory';
  }

  private async run<T>(
    useRedis: (r: Redis) => Promise<T>,
    useMemory: (m: MemoryStore) => Promise<T>,
  ): Promise<T> {
    if (this.redis && this.redis.status === 'ready') {
      try {
        return await useRedis(this.redis);
      } catch (error) {
        const now = Date.now();
        if (now - this.warnedAt > 30_000) {
          this.warnedAt = now;
          this.logger.warn(`[redis] command failed, using in-memory fallback: ${String(error)}`);
        }
      }
    }
    return useMemory(this.memory);
  }

  get(key: string) {
    return this.run((r) => r.get(key), (m) => m.get(key));
  }

  async set(key: string, value: string, ttlSec?: number) {
    await this.run(
      async (r) => {
        if (ttlSec) await r.set(key, value, 'EX', ttlSec);
        else await r.set(key, value);
      },
      (m) => m.set(key, value, ttlSec),
    );
  }

  setNx(key: string, value: string, ttlSec?: number) {
    return this.run(
      async (r) => {
        const res = ttlSec
          ? await r.set(key, value, 'EX', ttlSec, 'NX')
          : await r.set(key, value, 'NX');
        return res === 'OK';
      },
      (m) => m.setNx(key, value, ttlSec),
    );
  }

  async del(...keys: string[]) {
    if (keys.length === 0) return;
    await this.run(
      async (r) => {
        await r.del(...keys);
      },
      (m) => m.del(...keys),
    );
  }

  async expire(key: string, ttlSec: number) {
    await this.run(
      async (r) => {
        await r.expire(key, ttlSec);
      },
      (m) => m.expire(key, ttlSec),
    );
  }

  async zadd(key: string, score: number, member: string) {
    await this.run(
      async (r) => {
        await r.zadd(key, score, member);
      },
      (m) => m.zadd(key, score, member),
    );
  }

  zincrby(key: string, increment: number, member: string) {
    return this.run(
      async (r) => Number(await r.zincrby(key, increment, member)),
      (m) => m.zincrby(key, increment, member),
    );
  }

  zrevrange(key: string, start: number, stop: number) {
    return this.run<ZEntry[]>(
      async (r) => {
        const flat = await r.zrevrange(key, start, stop, 'WITHSCORES');
        const out: ZEntry[] = [];
        for (let i = 0; i < flat.length; i += 2) {
          out.push({ member: flat[i] as string, score: Number(flat[i + 1]) });
        }
        return out;
      },
      (m) => m.zrevrange(key, start, stop),
    );
  }

  zrevrank(key: string, member: string) {
    return this.run(
      (r) => r.zrevrank(key, member),
      (m) => m.zrevrank(key, member),
    );
  }

  zcard(key: string) {
    return this.run(
      (r) => r.zcard(key),
      (m) => m.zcard(key),
    );
  }

  async hset(key: string, field: string, value: string) {
    await this.run(
      async (r) => {
        await r.hset(key, field, value);
      },
      (m) => m.hset(key, field, value),
    );
  }

  hget(key: string, field: string) {
    return this.run(
      (r) => r.hget(key, field),
      (m) => m.hget(key, field),
    );
  }

  hmget(key: string, fields: string[]) {
    if (fields.length === 0) return Promise.resolve([]);
    return this.run(
      (r) => r.hmget(key, ...fields),
      (m) => m.hmget(key, fields),
    );
  }

  rpush(key: string, value: string) {
    return this.run(
      (r) => r.rpush(key, value),
      (m) => m.rpush(key, value),
    );
  }

  lrange(key: string, start: number, stop: number) {
    return this.run(
      (r) => r.lrange(key, start, stop),
      (m) => m.lrange(key, start, stop),
    );
  }

  lrem(key: string, value: string) {
    return this.run(
      (r) => r.lrem(key, 1, value),
      (m) => m.lrem(key, value),
    );
  }

  llen(key: string) {
    return this.run(
      (r) => r.llen(key),
      (m) => m.llen(key),
    );
  }

  async ping() {
    return this.run(
      async (r) => (await r.ping()) === 'PONG',
      async () => true,
    );
  }

  async close() {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
    await this.memory.close();
  }
}

export interface CreateStoreOptions {
  url?: string | undefined;
  logger: Logger;
  /** How long to wait for the first Redis connection before starting on the in-memory fallback. */
  connectTimeoutMs?: number;
}

/** Connects to Redis when reachable; otherwise returns a store that serves from memory (and keeps retrying Redis). */
export async function createStore(options: CreateStoreOptions): Promise<Store> {
  const { logger } = options;
  const url = options.url ?? resolveRedisUrl();
  if (!url) {
    logger.info('[redis] no REDIS_URL configured, using in-memory state');
    return new ResilientStore(null, logger);
  }
  if (isRailwayInternalUrl(url) && !process.env.RAILWAY_ENVIRONMENT) {
    logger.warn('[redis] URL is a Railway internal host and unreachable from here, using in-memory state');
    return new ResilientStore(null, logger);
  }

  const redis = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    connectTimeout: 4000,
    retryStrategy: (times) => Math.min(times * 1000, 15_000),
  });
  let loggedError = false;
  redis.on('error', (error) => {
    if (!loggedError) {
      loggedError = true;
      logger.warn(`[redis] connection error: ${error.message}`);
    }
  });
  redis.on('ready', () => {
    loggedError = false;
    logger.info('[redis] connected');
  });

  const timeoutMs = options.connectTimeoutMs ?? 5000;
  await Promise.race([
    redis.connect().catch(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs).unref()),
  ]);
  if (redis.status !== 'ready') {
    logger.warn('[redis] not reachable at startup, serving from memory and retrying in background');
  }
  return new ResilientStore(redis, logger);
}
