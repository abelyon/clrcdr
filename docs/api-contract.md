# API contract (`@mastermind/api`)

Base URL: `NEXT_PUBLIC_API_URL` (default `http://localhost:4000`). All bodies are JSON. Types and Zod schemas referenced below live in `@mastermind/shared` (`schemas.ts`, `socket.ts`); use them on the client for parsing.

## Conventions

- **Auth header:** `Authorization: Bearer <jwt>`. Tokens come from `register`, `login` or `guest` (HS256, 7 days). Payload: `sub` (user id), `username`, `role`, `guest` (boolean).
- **Guest users** have ids like `g_<uuid>`; they are not stored in Postgres. They can play solo, 1v1 and spectate, but never touch leaderboard, rating, persisted settings or tournaments (tournament join returns 403).
- **Error format** (every non-2xx): `{ "error": { "code": string, "message": string, "details"?: unknown } }`.

| HTTP | `code`                | When                                            |
| ---- | --------------------- | ----------------------------------------------- |
| 400  | `VALIDATION_ERROR`    | Zod failure; `details` = `{ field: message }`   |
| 401  | `UNAUTHORIZED`        | Missing/invalid/expired token, bad credentials  |
| 403  | `FORBIDDEN`           | Not admin / guest where registered user needed  |
| 404  | `NOT_FOUND`           | Unknown game / tournament / user                |
| 409  | `CONFLICT`            | Duplicate username/email (`details.field`), already joined, wrong tournament state, game already finished |
| 429  | `RATE_LIMITED`        | Too many requests                               |
| 503  | `SERVICE_UNAVAILABLE` | Postgres unreachable (guest + solo still work)  |
| 500  | `INTERNAL`            | Unexpected                                      |

- Colors are single letters (`PegColor`); a guess is an array of exactly 4 letters from the game palette `R,G,B,Y,P,O`.
- CORS: origin from `WEB_ORIGIN` (comma separated list; permissive when unset). Allowed headers: `Authorization, Content-Type`.

## REST

### Health

`GET /health` -> `200 { "status": "ok", "uptime": number, "store": "redis" | "memory", "db": boolean, "time": ISO }`

### Auth

| Route                     | Body                                   | Success                          |
| ------------------------- | -------------------------------------- | -------------------------------- |
| `POST /api/auth/register` | `{ username, email, password }`        | `201 AuthResponse` `{ token, user }` |
| `POST /api/auth/login`    | `{ email, password }`                  | `200 AuthResponse`               |
| `POST /api/auth/guest`    | `{ username? }` (optional)             | `201 AuthResponse` (`user.isGuest: true`, `email: null`) |
| `GET  /api/auth/me`       | (auth)                                 | `200 { user: AuthUser }`         |

The demo admin is `admin@clrcdr.gg` / `admin123` (role `ADMIN`).

### Settings (auth required)

- `GET /api/settings` -> `200 UserSettings` `{ language, colorblindMode, highContrast, theme, soundEnabled }`
- `PUT /api/settings` body = any subset of `UserSettings` -> `200 UserSettings` (merged). For guests: GET returns defaults, PUT echoes the merged values without persisting.

### Solo (auth optional)

A solo game id is returned by `POST /api/solo/start`; there is no socket involved in solo play.

- `POST /api/solo/start` (no body) -> `200 SoloStartResponse`: `{ gameId, codeLength: 4, maxAttempts: 10, palette: ["R","G","B","Y","P","O"], startedAt: epochMs }`. If a valid token is sent the game is bound to that user; without a token it is anonymous.
- `POST /api/solo/guess` body `{ gameId, guess: PegColor[4] }` -> `200 GuessResult`:
  `{ exact, partial, row (0-based), isWin, isGameOver, attemptsUsed?, durationMs?, score?, secretCode? }`.
  `secretCode`, `score` (`{ base, attemptBonus, timeBonus, total }`), `attemptsUsed` and `durationMs` are present **only when `isGameOver` is true**. `409 CONFLICT` once the game is finished; `404` for an unknown/expired game id.
- On game over, a registered (non-guest) owner's score is submitted automatically (leaderboard + stats + a `matches` row). Response field `score` carries the breakdown.
- `GET /api/solo/:gameId` -> `200 { gameId, codeLength, maxAttempts, palette, startedAt, guesses: GuessRecord[], isGameOver, secretCode? }` to resume after a page refresh (no secret while active).
- `POST /api/leaderboard/submit` (auth, registered) body `{ gameId }` -> `200 { submitted: boolean, score: ScoreBreakdown, rank: number | null }`. Idempotent. Lets an anonymous finished game be claimed after logging in (the game id is the proof). `409` if the game is still active; guests get `403`.

### Leaderboard

`GET /api/leaderboard?period=alltime|weekly&limit=50` (limit 1-100) -> `200 LeaderboardResponse` `{ period, entries: LeaderboardEntry[] }` with `rank, userId, username, rating, score, gamesPlayed, gamesWon, winRate (%), bestTimeMs, avgGuesses`. Served from Redis sorted sets (`lb:alltime`, `lb:weekly:<isoWeek>`) when available, else Postgres.

### Tournaments

Viewer-dependent `isJoined` is filled when a token is sent. Shapes: `TournamentSummary`, `TournamentDetail` (`participants`, `matches: BracketMatch[]`, `totalRounds`, `winner`).

| Route | Auth | Body | Success |
| ----- | ---- | ---- | ------- |
| `GET /api/tournaments` | optional | - | `200 { tournaments: TournamentSummary[] }` |
| `GET /api/tournaments/:id` | optional | - | `200 TournamentDetail` |
| `POST /api/tournaments` | ADMIN | `CreateTournamentInput` `{ name, description?, maxPlayers (2-128), startTime? }` | `201 TournamentDetail` |
| `POST /api/tournaments/:id/join` | registered | - | `200 TournamentDetail` (409 when full, closed or already joined) |
| `POST /api/tournaments/:id/leave` | registered | - | `200 TournamentDetail` (registration only) |
| `POST /api/tournaments/:id/start` | ADMIN | - | `200 TournamentDetail` (seeds by rating, builds N-player bracket padded with BYEs, auto-advances BYEs; bot-only matches are auto-resolved) |
| `POST /api/tournaments/:id/participants` | ADMIN | `{ userIds?: uuid[], botCount?: number }` | `200 TournamentDetail` (registration only) |
| `DELETE /api/tournaments/:id/participants/:userId` | ADMIN | - | `200 TournamentDetail` |
| `POST /api/tournaments/:id/reset` | ADMIN | - | `200 TournamentDetail` (back to REGISTRATION, bracket deleted) |
| `POST /api/tournaments/:id/matches/:tournamentMatchId/walkover` | ADMIN | `{ winnerId }` | `200 TournamentDetail` (advance a stuck match) |
| `GET /api/admin/users?q=&limit=` | ADMIN | - | `200 { users: { id, username, rating, isBot }[] }` for seeding players |

Bots: a bot (`isBot: true`) never plays. A match between two bots is won by the higher rating; a match between a human and a bot is a walkover for the human. Every REST mutation also broadcasts `tournament:bracket_updated` to the tournament room.

## Socket.io

Connect to the same origin with the default path `/socket.io`:

```ts
import { io, Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mastermind/shared';
const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io(API_URL, { auth: { token } });
```

The token (user or guest) is required in `auth.token` (an `Authorization: Bearer` header is also accepted). A missing/invalid token fails the handshake (`connect_error`, message `UNAUTHORIZED`). The server puts each socket into room `user:<id>`; all per-player emits go to that room, so several tabs of one user all receive events.

Events and payloads are exactly `ClientToServerEvents` / `ServerToClientEvents` in `packages/shared/src/socket.ts`. Acks follow `AckResponse`: `{ ok: true, data? }` or `{ ok: false, error, code }` (`SocketErrorCode`). If no ack callback is passed, failures are emitted as `match:error`.

### Quick match (`1v1:queue:*`)

1. `1v1:queue:join` -> ack `{ ok: true, data: { status: 'queued', waiting } }`; server also emits `1v1:queue:status`. Errors: `ALREADY_QUEUED`, `ALREADY_IN_MATCH`.
2. As soon as two distinct players are queued (FIFO) both get `1v1:queue:status { status: 'idle' }` then `match:started`.
3. `1v1:queue:leave` -> ack `{ ok: true }`, emits `1v1:queue:status { status: 'idle' }`. Disconnecting removes you from the queue.

### Private rooms (`1v1:room:*`)

- `1v1:room:create` -> ack and event `1v1:room:created` `{ code }` (6 chars from `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, valid 30 min) plus `1v1:room:state { code, status: 'waiting', players: 1 }`. Share the code (or a `/1v1?room=CODE` link built by the web app). Creating another room closes the previous one.
- `1v1:room:join { code }` (case-insensitive) -> the joiner and host both get `1v1:room:state { status: 'started', players: 2 }` and `match:started` (with `roomCode`). Errors: `ROOM_NOT_FOUND`, `ROOM_FULL`, `INVALID_PAYLOAD` (own room), `ALREADY_IN_MATCH`.
- If the host disconnects before anyone joins, the room is closed.

### Match flow (1v1 and tournament)

Both players race to crack the **same** hidden secret on their own board.

1. `match:started` `{ matchId, mode, codeLength, maxAttempts, palette, startedAt, opponent, roomCode?, tournamentId?, tournamentMatchId?, resume? }`. `startedAt` is epoch ms in the future (default +3 s countdown); guesses before it are rejected with `MATCH_NOT_READY`. `resume` (optional shared extension) is only set when re-sending state after a reconnect: `{ yourGuesses: GuessRecord[], opponentRows: { row, exact, partial }[] }`.
2. `match:guess { matchId, guess }` -> ack `GuessResult` for you and the same result as `match:guess_result { matchId, result }` to all your tabs. The opponent receives `match:opponent_progress { matchId, row, exact, partial, attemptsUsed, elapsedMs }` (never colors).
   - For matches `isGameOver` means **the match is over**. The secret is included (`secretCode`, plus `score`) only in that case. A player who used all 10 attempts while the opponent still plays gets `isGameOver: false` and further guesses fail with `MATCH_OVER`.
3. First player to crack the code wins immediately. If both use all attempts (or the 15 min timeout hits), the better best-guess wins (most exact, then most partial, then earlier last guess); a remaining tie is a draw (`winnerId: null`) in 1v1 and goes to the higher seed in tournaments.
4. `match:ended { matchId, winnerId, reason, secretCode, yourScore, opponentScore, durationMs, ratingChange, newRating, tournamentId? }`, `reason` is `solved | exhausted | forfeit | disconnect | timeout`. Rating (Elo, K=32) changes only for 1v1 between two registered users (otherwise `ratingChange: null`). Scores use `calculateScore` (the loser scores 0).
5. `match:forfeit { matchId }` ends the match as a loss for the sender.

Reconnect / abandonment:

- When a player's last socket disconnects the opponent gets `match:opponent_status { status: 'disconnected', graceMs: 30000 }`. If the player does not come back in 30 s the match ends with `reason: 'disconnect'` (opponent wins, status `ABANDONED` in Postgres). If both are gone, the match is abandoned without a winner (tournament: tie-break rules).
- On reconnect the server sends `match:opponent_status { status: 'connected' }` to the opponent and re-emits `match:started` (with `resume`) to the reconnecting player. `match:rejoin { matchId }` does the same on demand and returns the payload in the ack.

### Tournament matches

1. Admin starts the bracket (`POST /api/tournaments/:id/start`). Matches with both players are `READY`.
2. Clients call `tournament:subscribe { tournamentId }` (ack `{ ok: true }`); the server immediately emits `tournament:bracket_updated { tournamentId, status, matches, winnerId }` and then on every change. `tournament:unsubscribe` leaves the room.
3. Players call `tournament:match:join { tournamentId, tournamentMatchId }`. Only the two bracket players of a `READY`/`IN_PROGRESS` match are allowed (`NOT_YOUR_MATCH`, `MATCH_NOT_READY`).
   - First joiner: ack `{ ok: false, code: 'MATCH_NOT_READY', error: 'Waiting for opponent' }` means "waiting", keep listening; the opponent gets `tournament:match:ready { tournamentId, tournamentMatchId, round, opponent }`.
   - Second joiner: both get `match:started` (`mode: 'TOURNAMENT'`, `tournamentId`, `tournamentMatchId`); the second joiner's ack also carries the payload.
4. When the match ends the winner is written to the bracket, advanced into `nextMatchId` / `nextMatchSlot`, the next match becomes `READY` once both slots are filled, and `tournament:bracket_updated` is broadcast to the tournament room. Players of a newly ready match receive `tournament:match:ready`. After the final the tournament status becomes `COMPLETED`.

## Environment variables

| Variable | Default | Purpose |
| -------- | ------- | ------- |
| `PORT` | `4000` | HTTP + Socket.io port (host `0.0.0.0`) |
| `JWT_SECRET` | dev default | HMAC secret for tokens. Set it in production (`NODE_ENV=production` without it uses a random per-boot secret, so sessions reset on restart) |
| `WEB_ORIGIN` (alias `CORS_ORIGIN`) | permissive | Allowed CORS origins (comma separated, no trailing slash needed) |
| `DATABASE_PUBLIC_URL` / `DATABASE_URL` | - | Postgres (see `docs/railway.md`) |
| `REDIS_PUBLIC_URL` / `REDIS_URL` | in-memory fallback | Redis |
| `MATCH_COUNTDOWN_MS` | `3000` | Delay before a match accepts guesses |
| `JWT_EXPIRES_IN` | `7d` | Token lifetime |

Without a reachable Postgres the API still starts: guest login, solo play, 1v1 between guests and `/health` work; auth, settings, leaderboard fallback and tournaments return `503 SERVICE_UNAVAILABLE` until the background retry (every 10 s) succeeds. Without Redis all state is kept in memory (single instance).
