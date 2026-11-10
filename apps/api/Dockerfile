# Build context must be the repository root (monorepo-aware).
FROM node:22-slim AS builder
ENV CI=true
RUN npm install -g pnpm@12.18.0
WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/package.json packages/db/package.json
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN pnpm install --frozen-lockfile --filter @mastermind/api...

COPY packages/shared packages/shared
COPY packages/db packages/db
COPY apps/api apps/api
RUN pnpm --filter @mastermind/api... build

FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app /app

USER node
EXPOSE 4000
CMD ["node", "apps/api/dist/index.js"]
