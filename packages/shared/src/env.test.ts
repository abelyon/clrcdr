import { describe, expect, it } from 'vitest';
import { isRailwayInternalUrl, resolveDatabaseUrl, resolveRedisUrl } from './env';

describe('resolveDatabaseUrl', () => {
  it('prefers DATABASE_PUBLIC_URL', () => {
    expect(
      resolveDatabaseUrl({
        DATABASE_PUBLIC_URL: 'postgresql://pub',
        DATABASE_URL: 'postgresql://x.railway.internal/db',
      }),
    ).toBe('postgresql://pub');
  });

  it('builds a URL from the TCP proxy variables', () => {
    expect(
      resolveDatabaseUrl({
        RAILWAY_TCP_PROXY_DOMAIN: 'proxy.rlwy.net',
        RAILWAY_TCP_PROXY_PORT: '12345',
        PGUSER: 'postgres',
        PGPASSWORD: 'p@ss',
        PGDATABASE: 'railway',
        DATABASE_URL: 'postgresql://x.railway.internal/db',
      }),
    ).toBe('postgresql://postgres:p%40ss@proxy.rlwy.net:12345/railway');
  });

  it('falls back to DATABASE_URL and handles nothing', () => {
    expect(resolveDatabaseUrl({ DATABASE_URL: 'postgresql://local/db' })).toBe(
      'postgresql://local/db',
    );
    expect(resolveDatabaseUrl({})).toBeUndefined();
  });
});

describe('resolveRedisUrl', () => {
  it('prefers the public URL', () => {
    expect(resolveRedisUrl({ REDIS_PUBLIC_URL: 'redis://pub', REDIS_URL: 'redis://int' })).toBe(
      'redis://pub',
    );
    expect(resolveRedisUrl({ REDIS_URL: 'redis://int' })).toBe('redis://int');
    expect(resolveRedisUrl({})).toBeUndefined();
  });
});

describe('isRailwayInternalUrl', () => {
  it('detects internal hosts', () => {
    expect(isRailwayInternalUrl('redis://default:x@redis.railway.internal:6379')).toBe(true);
    expect(isRailwayInternalUrl('redis://host.proxy.rlwy.net:1234')).toBe(false);
    expect(isRailwayInternalUrl(undefined)).toBe(false);
  });
});
