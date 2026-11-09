export type EnvLike = Record<string, string | undefined>;

function currentEnv(): EnvLike {
  const g = globalThis as { process?: { env?: EnvLike } };
  return g.process?.env ?? {};
}

function clean(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** True when the URL points to a Railway private network host that is unreachable from outside Railway. */
export function isRailwayInternalUrl(url: string | undefined): boolean {
  return !!url && /\.railway\.internal(?=[:/]|$)/i.test(url);
}

/**
 * Postgres URL, preferring the public proxy so the same code runs locally and on Railway:
 * `DATABASE_PUBLIC_URL`, then a URL assembled from `RAILWAY_TCP_PROXY_DOMAIN` + `RAILWAY_TCP_PROXY_PORT`
 * + `PGUSER`/`PGPASSWORD`/`PGDATABASE`, then `DATABASE_URL`.
 */
export function resolveDatabaseUrl(env: EnvLike = currentEnv()): string | undefined {
  const publicUrl = clean(env.DATABASE_PUBLIC_URL);
  if (publicUrl) return publicUrl;

  const proxyDomain = clean(env.RAILWAY_TCP_PROXY_DOMAIN);
  const proxyPort = clean(env.RAILWAY_TCP_PROXY_PORT);
  const user = clean(env.PGUSER) ?? clean(env.POSTGRES_USER);
  const password = clean(env.PGPASSWORD) ?? clean(env.POSTGRES_PASSWORD);
  const database = clean(env.PGDATABASE) ?? clean(env.POSTGRES_DB);
  if (proxyDomain && proxyPort && user && password && database) {
    return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${proxyDomain}:${proxyPort}/${database}`;
  }

  return clean(env.DATABASE_URL);
}

/** Redis URL, preferring the public proxy: `REDIS_PUBLIC_URL`, then `REDIS_URL`. */
export function resolveRedisUrl(env: EnvLike = currentEnv()): string | undefined {
  return clean(env.REDIS_PUBLIC_URL) ?? clean(env.REDIS_URL);
}
