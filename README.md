# CLRCDR

Realtime Mastermind: solo play, instant 1v1 duels and live tournament brackets. pnpm + Turborepo monorepo deployed on Railway.

```
apps/api         @mastermind/api     Fastify/Express + Socket.io + Redis
apps/web         @mastermind/web     Next.js + Tailwind + shadcn/ui
packages/shared  @mastermind/shared  game logic, i18n (en/hu), Zod schemas, Socket.io contracts
packages/db      @mastermind/db      Drizzle ORM schema, migrations, seed
```

```bash
pnpm install
pnpm build
pnpm test
```

Copy `.env.example` to `.env` for local configuration. See `docs/railway.md` for the Railway setup and `.cursor/rules/architecture.mdc` for conventions.
