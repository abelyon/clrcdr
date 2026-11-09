# Railway

Project `daring-strength` (id `4ea4d132-e653-48a0-aa4e-89ff8a5b3215`), environment `production`. Linked from the repo with `railway link`.

Inspected with `railway status --json`, `railway service list` and `railway variable list -s <service>`. Values are intentionally not recorded here (names only).

## Services (already provisioned: do NOT `railway add` them again)

| Service    | Kind                | Notes                                          |
| ---------- | ------------------- | ---------------------------------------------- |
| `clrcdr`   | GitHub (abelyon/clrcdr, `main`) | App service; last deploy failed because the repo was empty. |
| `Postgres` | Railway Postgres    | Volume `postgres-volume`, TCP proxy enabled.   |
| `Redis`    | Railway Redis       | Volume `redis-volume`. No TCP proxy / public URL variable exists. |

## Variable names

### `Postgres`

- Public (reachable from your machine and from anywhere): `DATABASE_PUBLIC_URL`, `RAILWAY_TCP_PROXY_DOMAIN`, `RAILWAY_TCP_PROXY_PORT`, `RAILWAY_TCP_APPLICATION_PORT`
- Internal (`*.railway.internal`, only inside Railway): `DATABASE_URL`, `PGHOST`, `RAILWAY_PRIVATE_DOMAIN`
- Credentials / parts: `PGUSER`, `PGPASSWORD`, `PGDATABASE`, `PGPORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- Housekeeping: `PGDATA`, `SSL_CERT_DAYS`, `RAILWAY_*` (project/environment/service ids, volume info, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS`)

### `Redis`

- Internal only: `REDIS_URL`, `REDISHOST`, `REDISPORT`, `REDISUSER`, `REDISPASSWORD`, `REDIS_PASSWORD`, `RAILWAY_PRIVATE_DOMAIN`
- Public: none. `REDIS_PUBLIC_URL` does not exist. Enable a TCP proxy on the Redis service and add `REDIS_PUBLIC_URL` to use Redis from a local machine; otherwise the API falls back to in-memory state when Redis is unreachable.
- Housekeeping: `RAILWAY_*` (project/environment/service ids, volume info)

### `clrcdr` (the app service)

Only the Railway-provided variables exist: `RAILWAY_ENVIRONMENT`, `RAILWAY_ENVIRONMENT_ID`, `RAILWAY_ENVIRONMENT_NAME`, `RAILWAY_PRIVATE_DOMAIN`, `RAILWAY_PROJECT_ID`, `RAILWAY_PROJECT_NAME`, `RAILWAY_SERVICE_ID`, `RAILWAY_SERVICE_NAME`.

Variables the app services should reference from the other services (Railway reference variables) when deploying:

| App variable          | Reference                           |
| --------------------- | ----------------------------------- |
| `DATABASE_URL`        | `${{Postgres.DATABASE_URL}}`        |
| `DATABASE_PUBLIC_URL` | `${{Postgres.DATABASE_PUBLIC_URL}}` (optional) |
| `REDIS_URL`           | `${{Redis.REDIS_URL}}`              |
| `JWT_SECRET`          | set manually (random string)        |

## How the code picks connection URLs

Implemented in `packages/shared/src/env.ts` and re-exported by `@mastermind/db`:

- `resolveDatabaseUrl()` returns `DATABASE_PUBLIC_URL`, else a URL assembled from `RAILWAY_TCP_PROXY_DOMAIN` + `RAILWAY_TCP_PROXY_PORT` + `PGUSER`/`PGPASSWORD`/`PGDATABASE`, else `DATABASE_URL`.
- `resolveRedisUrl()` returns `REDIS_PUBLIC_URL`, else `REDIS_URL`. `isRailwayInternalUrl(url)` flags `*.railway.internal` hosts that cannot be reached locally.

## Running DB commands against Railway from your machine

```bash
railway run -s Postgres -- pnpm --filter @mastermind/db db:migrate   # apply SQL migrations
railway run -s Postgres -- pnpm --filter @mastermind/db db:seed      # migrate + idempotent seed
```

`railway run -s Postgres` injects the Postgres service variables (including `DATABASE_PUBLIC_URL`). The API also migrates and seeds on every startup via `ensureDbReadyAndSeeded()`, so this is optional.

## State of the database

Migrations (`packages/db/drizzle/0000_init.sql`) are applied and the seed has run: admin `admin@clrcdr.gg` / `admin123`, 8 demo players (password `demo123`), 93 sample solo matches and 2 sample tournaments.
