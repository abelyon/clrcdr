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

## Deploying the app (api + web)

Both services build from the **repository root** with their own Dockerfile (pnpm monorepo aware). Railway could not be reached from the build agent (Railway MCP unavailable, CLI not authenticated), so the services below must be created once by hand or with the CLI; everything else is checked in.

Files:

| File                     | Purpose                                                                 |
| ------------------------ | ----------------------------------------------------------------------- |
| `railway.json`           | Root config = API (used by the existing `clrcdr` service as-is)         |
| `apps/api/railway.json`  | API config (`DOCKERFILE`, healthcheck `/health`)                        |
| `apps/web/railway.json`  | Web config (`DOCKERFILE`, healthcheck `/`)                              |
| `apps/api/Dockerfile`    | Installs the api closure, builds `shared` -> `db` -> `api`, runs `node apps/api/dist/index.js` |
| `apps/web/Dockerfile`    | Builds `shared` -> `web` (Next `output: 'standalone'`), runs `node apps/web/server.js`; build args `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_SOCKET_URL` |
| `.dockerignore`          | Keeps `node_modules`, `.next`, `.git` out of the build context          |

### Service 1: `api` (reuse the existing `clrcdr` service, optionally rename it to `api`)

1. Source: GitHub `abelyon/clrcdr`, branch `main`, root directory `/` (leave empty). It picks up `railway.json` automatically. Alternatively set **Config-as-code path** to `/apps/api/railway.json`.
2. Variables (names only):
   - `NODE_ENV=production`
   - `JWT_SECRET` = a long random string (e.g. `openssl rand -hex 32`); set in the dashboard, never commit it
   - `DATABASE_URL` = `${{Postgres.DATABASE_URL}}`
   - `REDIS_URL` = `${{Redis.REDIS_URL}}`
   - `WEB_ORIGIN` = the public URL of the web service, e.g. `https://${{web.RAILWAY_PUBLIC_DOMAIN}}` (comma separated for several; a trailing slash is ignored)
   - `PORT` is provided by Railway; the API listens on it on `0.0.0.0`.
3. Networking: generate a public domain (the browser calls it directly, REST and Socket.io share the origin).
4. On startup the API runs migrations and the idempotent seed (`ensureDbReadyAndSeeded()`), so no manual `db:push` is needed. Health check: `GET /health`.

### Service 2: `web` (new service from the same repo)

1. Source: GitHub `abelyon/clrcdr`, branch `main`, root directory `/`. Set **Config-as-code path** to `/apps/web/railway.json`.
2. Variables (names only; Railway passes them to the Docker build as build args, so set them **before** the first deploy and redeploy after changing them):
   - `NEXT_PUBLIC_API_URL` = public URL of the API service, e.g. `https://${{api.RAILWAY_PUBLIC_DOMAIN}}` (no trailing slash)
   - `NEXT_PUBLIC_SOCKET_URL` (optional, defaults to `NEXT_PUBLIC_API_URL`)
3. Networking: generate a public domain, then put it in the API's `WEB_ORIGIN`.

### CLI equivalent

```bash
railway link                         # project daring-strength, environment production
railway add --service web            # only the web service; Postgres/Redis/api already exist
railway variables --service clrcdr --set "NODE_ENV=production" \
  --set 'DATABASE_URL=${{Postgres.DATABASE_URL}}' --set 'REDIS_URL=${{Redis.REDIS_URL}}' \
  --set "JWT_SECRET=$(openssl rand -hex 32)" --set 'WEB_ORIGIN=https://<web-domain>'
railway variables --service web --set 'NEXT_PUBLIC_API_URL=https://<api-domain>'
railway up --service clrcdr
railway up --service web
```

### Smoke check after deploy

`GET <api>/health` returns `{"status":"ok","store":"redis","db":true,...}`; the web app loads at its domain; `admin@clrcdr.gg` / `admin123` logs in (change that password for a real launch).
