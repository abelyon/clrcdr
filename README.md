# clrcdr

Portfolio-grade Mastermind web game: Next.js frontend, Node.js + Socket.io API, PostgreSQL and Redis on Railway. Built as a pnpm + Turborepo monorepo.

## Layout

| Path | Package | Purpose |
| --- | --- | --- |
| `apps/web` | `@mastermind/web` | Next.js App Router UI (EN/HU, Tailwind, shadcn/ui) |
| `apps/api` | `@mastermind/api` | REST + Socket.io server; owns all secret codes |
| `packages/shared` | `@mastermind/shared` | Evaluation logic, Zod schemas, typed Socket.io contracts, score formula |
| `packages/db` | `@mastermind/db` | Drizzle ORM schema for PostgreSQL |

## Getting started

Requires Node >= 20 and pnpm 10.

```bash
pnpm install
pnpm build       # turbo run build
pnpm typecheck
pnpm test
pnpm dev
```

## Anti-cheat

Secret codes never leave `apps/api`. Clients only receive `{ exact, partial, isWin, isGameOver }` per guess (and, in 1V1, the opponent's row index and peg counts, never colors) until the game ends.

## Using `@mastermind/shared`

```ts
import { generateSecretCode, buildFeedback, resolveGameConfig } from "@mastermind/shared";

const config = resolveGameConfig();
const secret = generateSecretCode(config); // server only
const feedback = buildFeedback(secret, [0, 1, 2, 3], 1, config);
```

Colors are zero-based palette indices. The package ships ESM + CJS builds with type declarations; add `"@mastermind/shared": "workspace:*"` to a consumer's dependencies.
