import net from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';
import { closeDb } from '@mastermind/db';
import {
  REDIS_KEYS,
  type AckResponse,
  type AuthResponse,
  type GuessResult,
  type LeaderboardResponse,
  type MatchEndedPayload,
  type MatchStartedPayload,
  type PegColor,
  type TournamentBracketUpdatedPayload,
  type TournamentDetail,
  type TournamentMatchReadyPayload,
  type TournamentSummary,
} from '@mastermind/shared';
import { DbAccess } from '../src/db';
import type { LiveMatch } from '../src/game/match-logic';
import { silentLogger } from '../src/lib/logger';
import type { SoloGame } from '../src/game/solo-logic';
import { api, connectSocket, emitAck, once, startTestServer, type ClientSocket, type TestServer } from './helpers-http';

const WRONG: PegColor[] = ['P', 'P', 'O', 'O'];

let pg: PGlite;
let pgServer: PGLiteSocketServer;
let server: TestServer;
const sockets: ClientSocket[] = [];

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await api<AuthResponse>(server, 'POST', '/api/auth/login', { email, password });
  expect(res.status).toBe(200);
  return res.body;
}

async function register(name: string): Promise<AuthResponse> {
  const res = await api<AuthResponse>(server, 'POST', '/api/auth/register', {
    username: name,
    email: `${name.toLowerCase()}@test.gg`,
    password: 'secret123',
  });
  expect(res.status).toBe(201);
  return res.body;
}

async function open(token: string): Promise<ClientSocket> {
  const s = await connectSocket(server, token);
  sockets.push(s);
  return s;
}

async function secretOfMatch(matchId: string): Promise<PegColor[]> {
  return (JSON.parse((await server.store.get(REDIS_KEYS.match(matchId))) as string) as LiveMatch).secret;
}

beforeAll(async () => {
  pg = await PGlite.create();
  const port = await freePort();
  pgServer = new PGLiteSocketServer({ db: pg, port, host: '127.0.0.1', maxConnections: 20 });
  await pgServer.start();
  process.env.DATABASE_PUBLIC_URL = `postgresql://postgres:postgres@127.0.0.1:${port}/postgres?sslmode=disable`;

  const db = new DbAccess(process.env.TEST_VERBOSE ? console : silentLogger);
  expect(await db.initialize(60_000)).toBe(true);
  server = await startTestServer({ db });
  await server.ctx.leaderboard.warm();
}, 120_000);

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await server?.stop();
  await closeDb().catch(() => undefined);
  await pgServer?.stop().catch(() => undefined);
  await pg?.close().catch(() => undefined);
  delete process.env.DATABASE_PUBLIC_URL;
}, 30_000);

describe('auth + settings (Postgres)', () => {
  it('registers, rejects duplicates, logs in and persists settings', async () => {
    const reg = await register('Zed');
    expect(reg.user).toMatchObject({ username: 'Zed', role: 'PLAYER', isGuest: false, rating: 1000 });

    const dup = await api<{ error: { code: string; details: { field: string } } }>(server, 'POST', '/api/auth/register', {
      username: 'Zed2',
      email: 'zed@test.gg',
      password: 'secret123',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.details.field).toBe('email');

    const bad = await api(server, 'POST', '/api/auth/login', { email: 'zed@test.gg', password: 'wrong-pass' });
    expect(bad.status).toBe(401);

    const again = await login('zed@test.gg', 'secret123');
    const me = await api<{ user: { username: string } }>(server, 'GET', '/api/auth/me', undefined, again.token);
    expect(me.body.user.username).toBe('Zed');

    const put = await api(server, 'PUT', '/api/settings', { language: 'hu', colorblindMode: true }, again.token);
    expect(put.status).toBe(200);
    const get = await api<{ language: string; colorblindMode: boolean; theme: string }>(server, 'GET', '/api/settings', undefined, again.token);
    expect(get.body).toMatchObject({ language: 'hu', colorblindMode: true, theme: 'dark' });
  });

  it('logs in the seeded demo admin', async () => {
    const admin = await login('admin@clrcdr.gg', 'admin123');
    expect(admin.user.role).toBe('ADMIN');
  });
});

describe('solo score submission and leaderboard (Postgres + sorted sets)', () => {
  it('auto-submits a registered player win and ranks them', async () => {
    const reg = await register('Solver');
    const before = await api<LeaderboardResponse>(server, 'GET', '/api/leaderboard?period=alltime&limit=100');
    expect(before.body.entries.length).toBeGreaterThan(0);

    const start = await api<{ gameId: string }>(server, 'POST', '/api/solo/start', undefined, reg.token);
    const stored = JSON.parse((await server.store.get(REDIS_KEYS.game(start.body.gameId))) as string) as SoloGame;
    expect(stored.ownerId).toBe(reg.user.id);

    const stranger = await register('Stranger');
    const forbidden = await api(server, 'POST', '/api/solo/guess', { gameId: start.body.gameId, guess: WRONG }, stranger.token);
    expect(forbidden.status).toBe(403);

    const win = await api<GuessResult>(server, 'POST', '/api/solo/guess', { gameId: start.body.gameId, guess: stored.secret }, reg.token);
    expect(win.body).toMatchObject({ isWin: true, isGameOver: true });
    const total = win.body.score?.total ?? 0;
    expect(total).toBeGreaterThan(1000);

    const submit = await api<{ submitted: boolean; rank: number | null }>(server, 'POST', '/api/leaderboard/submit', { gameId: start.body.gameId }, reg.token);
    expect(submit.status).toBe(200);
    expect(submit.body.submitted).toBe(false);
    expect(submit.body.rank).toBeGreaterThan(0);

    for (const period of ['alltime', 'weekly'] as const) {
      const board = await api<LeaderboardResponse>(server, 'GET', `/api/leaderboard?period=${period}&limit=100`);
      const mine = board.body.entries.find((e) => e.userId === reg.user.id);
      expect(mine).toMatchObject({ username: 'Solver', score: total, gamesPlayed: 1, gamesWon: 1, winRate: 100 });
      expect(mine?.bestTimeMs).not.toBeNull();
      expect(board.body.entries.map((e) => e.rank)).toEqual(board.body.entries.map((_, i) => i + 1));
    }
  });

  it('lets an anonymous finished game be claimed after login, exactly once', async () => {
    const start = await api<{ gameId: string }>(server, 'POST', '/api/solo/start');
    const stored = JSON.parse((await server.store.get(REDIS_KEYS.game(start.body.gameId))) as string) as SoloGame;
    await api(server, 'POST', '/api/solo/guess', { gameId: start.body.gameId, guess: stored.secret });

    const claimer = await register('Claimer');
    const first = await api<{ submitted: boolean }>(server, 'POST', '/api/leaderboard/submit', { gameId: start.body.gameId }, claimer.token);
    expect(first.body.submitted).toBe(true);
    const second = await api<{ submitted: boolean }>(server, 'POST', '/api/leaderboard/submit', { gameId: start.body.gameId }, claimer.token);
    expect(second.body.submitted).toBe(false);

    const active = await api<{ gameId: string }>(server, 'POST', '/api/solo/start');
    const notDone = await api(server, 'POST', '/api/leaderboard/submit', { gameId: active.body.gameId }, claimer.token);
    expect(notDone.status).toBe(409);
  });
});

describe('1v1 rating updates (Postgres)', () => {
  it('applies Elo and stats for two registered players', async () => {
    const [a, b] = await Promise.all([register('EloA'), register('EloB')]);
    const sa = await open(a.token);
    const sb = await open(b.token);
    const startedA = once(sa, 'match:started');
    await emitAck(sa, '1v1:queue:join');
    await emitAck(sb, '1v1:queue:join');
    const started = (await startedA) as MatchStartedPayload;
    const secret = await secretOfMatch(started.matchId);

    const endedA = once(sa, 'match:ended');
    const endedB = once(sb, 'match:ended');
    await emitAck<AckResponse<GuessResult>>(sa, 'match:guess', { matchId: started.matchId, guess: secret });
    const [ea, eb] = (await Promise.all([endedA, endedB])) as [MatchEndedPayload, MatchEndedPayload];
    expect(ea.winnerId).toBe(a.user.id);
    expect(ea.ratingChange).toBe(16);
    expect(ea.newRating).toBe(1016);
    expect(eb.ratingChange).toBe(-16);
    expect(eb.newRating).toBe(984);

    const meA = await api<{ user: { rating: number; gamesPlayed: number; gamesWon: number } }>(server, 'GET', '/api/auth/me', undefined, a.token);
    expect(meA.body.user).toMatchObject({ rating: 1016, gamesPlayed: 1, gamesWon: 1 });
    const meB = await api<{ user: { rating: number; gamesWon: number } }>(server, 'GET', '/api/auth/me', undefined, b.token);
    expect(meB.body.user).toMatchObject({ rating: 984, gamesWon: 0 });
  });
});

describe('tournament flow (Postgres)', () => {
  it('runs a 3-player bracket with a BYE, advancing winners and broadcasting updates', async () => {
    const admin = await login('admin@clrcdr.gg', 'admin123');
    const [p1, p2, p3] = await Promise.all([register('TPlayerOne'), register('TPlayerTwo'), register('TPlayerThree')]);

    const create = await api<TournamentDetail>(server, 'POST', '/api/tournaments', { name: 'Flow Cup', maxPlayers: 8 }, admin.token);
    expect(create.status).toBe(201);
    const id = create.body.id;
    expect(create.body.status).toBe('REGISTRATION');

    expect((await api(server, 'POST', `/api/tournaments/${id}/start`, undefined, admin.token)).status).toBe(409);
    for (const p of [p1, p2, p3]) {
      const joined = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/join`, undefined, p.token);
      expect(joined.status).toBe(200);
      expect(joined.body.isJoined).toBe(true);
    }
    expect((await api(server, 'POST', `/api/tournaments/${id}/join`, undefined, p1.token)).status).toBe(409);
    expect((await api(server, 'POST', `/api/tournaments/${id}/start`, undefined, p1.token)).status).toBe(403);

    const list = await api<{ tournaments: TournamentSummary[] }>(server, 'GET', '/api/tournaments', undefined, p1.token);
    expect(list.body.tournaments.find((t) => t.id === id)).toMatchObject({ participantCount: 3, isJoined: true });
    expect((await api(server, 'GET', '/api/tournaments/not-a-uuid')).status).toBe(404);

    const s1 = await open(p1.token);
    const s2 = await open(p2.token);
    const s3 = await open(p3.token);
    const updates: TournamentBracketUpdatedPayload[] = [];
    s3.on('tournament:bracket_updated', (p) => updates.push(p));
    const firstBracket = once(s3, 'tournament:bracket_updated');
    expect(await emitAck(s3, 'tournament:subscribe', { tournamentId: id })).toEqual({ ok: true });
    expect(((await firstBracket) as TournamentBracketUpdatedPayload).status).toBe('REGISTRATION');

    const ready1 = once(s1, 'tournament:match:ready');
    const ready2 = once(s2, 'tournament:match:ready');
    const start = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/start`, undefined, admin.token);
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ status: 'IN_PROGRESS', totalRounds: 2 });
    expect(start.body.matches).toHaveLength(3);
    const round1 = start.body.matches.filter((m) => m.round === 1);
    expect(round1.filter((m) => m.status === 'BYE')).toHaveLength(1);
    const real = round1.find((m) => m.status === 'READY');
    expect(real).toBeDefined();
    const byeWinner = round1.find((m) => m.status === 'BYE')?.winnerId as string;
    const final = start.body.matches.find((m) => m.round === 2);
    expect(final?.status).toBe('PENDING');

    const players = [p1, p2, p3];
    const duelists = players.filter((p) => p.user.id === real?.player1?.id || p.user.id === real?.player2?.id);
    const bye = players.find((p) => p.user.id === byeWinner) as AuthResponse;
    expect(duelists).toHaveLength(2);
    const readyPayload = (await Promise.race([ready1, ready2])) as TournamentMatchReadyPayload;
    expect(readyPayload).toMatchObject({ tournamentId: id, tournamentMatchId: real?.id, round: 1 });

    const sockOf = (u: AuthResponse) => [s1, s2, s3][players.indexOf(u)] as ClientSocket;
    const [d1, d2] = duelists as [AuthResponse, AuthResponse];

    expect(await emitAck(sockOf(bye), 'tournament:match:join', { tournamentId: id, tournamentMatchId: real?.id })).toMatchObject({
      ok: false,
      code: 'NOT_YOUR_MATCH',
    });
    expect(await emitAck(sockOf(d1), 'tournament:match:join', { tournamentId: id, tournamentMatchId: final?.id })).toMatchObject({
      ok: false,
      code: 'NOT_YOUR_MATCH',
    });

    const waiting = await emitAck<AckResponse<MatchStartedPayload>>(sockOf(d1), 'tournament:match:join', {
      tournamentId: id,
      tournamentMatchId: real?.id,
    });
    expect(waiting).toMatchObject({ ok: false, code: 'MATCH_NOT_READY' });

    const startedD1 = once(sockOf(d1), 'match:started');
    const joined = await emitAck<AckResponse<MatchStartedPayload>>(sockOf(d2), 'tournament:match:join', {
      tournamentId: id,
      tournamentMatchId: real?.id,
    });
    expect(joined.ok).toBe(true);
    const started = (await startedD1) as MatchStartedPayload;
    expect(started).toMatchObject({ mode: 'TOURNAMENT', tournamentId: id, tournamentMatchId: real?.id });

    const secret = await secretOfMatch(started.matchId);
    const endedD1 = once(sockOf(d1), 'match:ended');
    const finalReady = once(sockOf(bye), 'tournament:match:ready');
    await emitAck(sockOf(d2), 'match:guess', { matchId: started.matchId, guess: secret });
    const ended = (await endedD1) as MatchEndedPayload;
    expect(ended).toMatchObject({ winnerId: d2.user.id, tournamentId: id, ratingChange: null });
    expect(await finalReady).toMatchObject({ tournamentId: id, tournamentMatchId: final?.id, round: 2 });

    await new Promise((r) => setTimeout(r, 50));
    const mid = await api<TournamentDetail>(server, 'GET', `/api/tournaments/${id}`);
    const r1 = mid.body.matches.find((m) => m.id === real?.id);
    expect(r1).toMatchObject({ status: 'COMPLETED', winnerId: d2.user.id });
    expect(r1?.matchId).toBe(started.matchId);
    const midFinal = mid.body.matches.find((m) => m.round === 2);
    expect(midFinal?.status).toBe('READY');
    expect([midFinal?.player1?.id, midFinal?.player2?.id].sort()).toEqual([byeWinner, d2.user.id].sort());
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates.at(-1)?.matches.find((m) => m.round === 2)?.status).toBe('READY');

    const finalists = [bye, d2];
    const [f1, f2] = finalists as [AuthResponse, AuthResponse];
    await emitAck(sockOf(f1), 'tournament:match:join', { tournamentId: id, tournamentMatchId: final?.id });
    const startedFinal = once(sockOf(f1), 'match:started');
    await emitAck(sockOf(f2), 'tournament:match:join', { tournamentId: id, tournamentMatchId: final?.id });
    const finalStarted = (await startedFinal) as MatchStartedPayload;
    const finalSecret = await secretOfMatch(finalStarted.matchId);
    const finalEnded = once(sockOf(f1), 'match:ended');
    await emitAck(sockOf(f1), 'match:guess', { matchId: finalStarted.matchId, guess: finalSecret });
    expect(((await finalEnded) as MatchEndedPayload).winnerId).toBe(f1.user.id);

    await new Promise((r) => setTimeout(r, 50));
    const done = await api<TournamentDetail>(server, 'GET', `/api/tournaments/${id}`);
    expect(done.body.status).toBe('COMPLETED');
    expect(done.body.winner?.id).toBe(f1.user.id);
    expect(updates.at(-1)).toMatchObject({ status: 'COMPLETED', winnerId: f1.user.id });

    const reset = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/reset`, undefined, admin.token);
    expect(reset.body).toMatchObject({ status: 'REGISTRATION', matches: [] });
  });

  it('auto-resolves bot matches and supports walkovers and admin tools', async () => {
    const admin = await login('admin@clrcdr.gg', 'admin123');
    const human = await register('LoneHuman');
    const create = await api<TournamentDetail>(server, 'POST', '/api/tournaments', { name: 'Bot Cup', maxPlayers: 4 }, admin.token);
    const id = create.body.id;

    const users = await api<{ users: { id: string; username: string }[] }>(server, 'GET', '/api/admin/users?q=LoneHuman', undefined, admin.token);
    expect(users.body.users.map((u) => u.username)).toEqual(['LoneHuman']);

    const added = await api<TournamentDetail>(
      server,
      'POST',
      `/api/tournaments/${id}/participants`,
      { userIds: [human.user.id], botCount: 3 },
      admin.token,
    );
    expect(added.body.participantCount).toBe(4);
    expect(added.body.participants.filter((p) => p.isBot)).toHaveLength(3);

    const started = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/start`, undefined, admin.token);
    expect(started.status).toBe(200);
    const finalMatch = started.body.matches.find((m) => m.round === 2);
    expect(started.body.matches.filter((m) => m.round === 1).every((m) => m.status === 'COMPLETED')).toBe(true);
    expect(finalMatch?.status).toBe('COMPLETED');
    expect(started.body.status).toBe('COMPLETED');
    expect(started.body.winner?.id).toBe(human.user.id);

    const resetAgain = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/reset`, undefined, admin.token);
    expect(resetAgain.body.status).toBe('REGISTRATION');
    const removed = await api<TournamentDetail>(
      server,
      'DELETE',
      `/api/tournaments/${id}/participants/${human.user.id}`,
      undefined,
      admin.token,
    );
    expect(removed.body.participantCount).toBe(3);
  });

  it('lets an admin force a walkover on a stuck match', async () => {
    const admin = await login('admin@clrcdr.gg', 'admin123');
    const [a, b] = await Promise.all([register('WalkA'), register('WalkB')]);
    const create = await api<TournamentDetail>(server, 'POST', '/api/tournaments', { name: 'Walk Cup', maxPlayers: 2 }, admin.token);
    const id = create.body.id;
    await api(server, 'POST', `/api/tournaments/${id}/join`, undefined, a.token);
    await api(server, 'POST', `/api/tournaments/${id}/join`, undefined, b.token);
    const full = await api(server, 'POST', `/api/tournaments/${id}/join`, undefined, (await register('WalkC')).token);
    expect(full.status).toBe(409);
    const started = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/start`, undefined, admin.token);
    const match = started.body.matches[0];
    const bad = await api(server, 'POST', `/api/tournaments/${id}/matches/${match?.id}/walkover`, { winnerId: '00000000-0000-4000-8000-000000000000' }, admin.token);
    expect(bad.status).toBe(409);
    const ok = await api<TournamentDetail>(server, 'POST', `/api/tournaments/${id}/matches/${match?.id}/walkover`, { winnerId: b.user.id }, admin.token);
    expect(ok.body).toMatchObject({ status: 'COMPLETED' });
    expect(ok.body.winner?.id).toBe(b.user.id);
  });
});
