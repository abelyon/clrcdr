import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  REDIS_KEYS,
  type AckResponse,
  type AuthResponse,
  type GuessResult,
  type MatchEndedPayload,
  type MatchStartedPayload,
  type PegColor,
  type RoomStatePayload,
  type SoloStartResponse,
} from '@mastermind/shared';
import type { LiveMatch } from '../src/game/match-logic';
import type { SoloGame } from '../src/game/solo-logic';
import { api, connectSocket, createSocket, emitAck, once, startTestServer, type ClientSocket, type TestServer } from './helpers-http';

const WRONG: PegColor[] = ['P', 'P', 'O', 'O'];
let server: TestServer;
const sockets: ClientSocket[] = [];

async function guest(name?: string): Promise<AuthResponse> {
  const res = await api<AuthResponse>(server, 'POST', '/api/auth/guest', name ? { username: name } : {});
  expect(res.status).toBe(201);
  return res.body;
}

async function open(token: string): Promise<ClientSocket> {
  const s = await connectSocket(server, token);
  sockets.push(s);
  return s;
}

beforeAll(async () => {
  server = await startTestServer();
});

afterAll(async () => {
  for (const s of sockets) s.disconnect();
  await server.stop();
});

describe('REST smoke (in-memory fallback)', () => {
  it('reports health with the memory store', async () => {
    const res = await api<{ status: string; store: string; db: boolean }>(server, 'GET', '/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', store: 'memory', db: false });
  });

  it('issues guest tokens and resolves them on /me', async () => {
    const g = await guest('Tester');
    expect(g.user).toMatchObject({ username: 'Tester', isGuest: true, email: null, role: 'PLAYER' });
    const me = await api<{ user: { id: string } }>(server, 'GET', '/api/auth/me', undefined, g.token);
    expect(me.body.user.id).toBe(g.user.id);
  });

  it('formats errors consistently', async () => {
    const noAuth = await api<{ error: { code: string } }>(server, 'GET', '/api/auth/me');
    expect(noAuth.status).toBe(401);
    expect(noAuth.body.error.code).toBe('UNAUTHORIZED');

    const badToken = await api<{ error: { code: string } }>(server, 'GET', '/api/auth/me', undefined, 'nope');
    expect(badToken.status).toBe(401);

    const invalid = await api<{ error: { code: string; details: Record<string, string> } }>(
      server,
      'POST',
      '/api/solo/guess',
      { gameId: '', guess: ['R'] },
    );
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe('VALIDATION_ERROR');
    expect(Object.keys(invalid.body.error.details)).toContain('guess');

    const missing = await api<{ error: { code: string } }>(server, 'GET', '/api/nope');
    expect(missing.status).toBe(404);

    const db = await api<{ error: { code: string } }>(server, 'POST', '/api/auth/login', { email: 'a@b.co', password: 'x' });
    expect(db.status).toBe(503);
    expect(db.body.error.code).toBe('SERVICE_UNAVAILABLE');
  });

  it('answers CORS preflight', async () => {
    const res = await fetch(`${server.url}/api/solo/start`, {
      method: 'OPTIONS',
      headers: {
        origin: 'http://localhost:3000',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'authorization,content-type',
      },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBeTruthy();
  });

  it('serves default settings to guests and requires auth otherwise', async () => {
    const g = await guest();
    const get = await api<{ language: string }>(server, 'GET', '/api/settings', undefined, g.token);
    expect(get.body.language).toBe('en');
    const put = await api<{ colorblindMode: boolean; theme: string }>(server, 'PUT', '/api/settings', { colorblindMode: true }, g.token);
    expect(put.body).toMatchObject({ colorblindMode: true, theme: 'dark' });
    expect((await api(server, 'GET', '/api/settings')).status).toBe(401);
  });

  it('plays a full solo game without ever leaking the secret early', async () => {
    const start = await api<SoloStartResponse>(server, 'POST', '/api/solo/start');
    expect(start.status).toBe(200);
    expect(start.body).toMatchObject({ codeLength: 4, maxAttempts: MAX_ATTEMPTS, palette: ['R', 'G', 'B', 'Y', 'P', 'O'] });
    expect(JSON.stringify(start.body)).not.toContain('secret');
    const { gameId } = start.body;

    const first = await api<GuessResult>(server, 'POST', '/api/solo/guess', { gameId, guess: WRONG });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ row: 0, isWin: false, isGameOver: false });
    expect(first.body.secretCode).toBeUndefined();

    const snap = await api<{ guesses: unknown[]; isGameOver: boolean; secretCode?: unknown }>(server, 'GET', `/api/solo/${gameId}`);
    expect(snap.body.guesses).toHaveLength(1);
    expect(snap.body.secretCode).toBeUndefined();

    const stored = JSON.parse((await server.store.get(REDIS_KEYS.game(gameId))) as string) as SoloGame;
    const win = await api<GuessResult>(server, 'POST', '/api/solo/guess', { gameId, guess: stored.secret });
    expect(win.body).toMatchObject({ isWin: true, isGameOver: true, row: 1, attemptsUsed: 2, secretCode: stored.secret });
    expect(win.body.score?.total).toBeGreaterThan(1000);

    const again = await api(server, 'POST', '/api/solo/guess', { gameId, guess: WRONG });
    expect(again.status).toBe(409);
    expect((await api(server, 'POST', '/api/solo/guess', { gameId: 'unknown', guess: WRONG })).status).toBe(404);
  });

  it('restricts leaderboard submission to registered users and serves an empty board', async () => {
    const g = await guest();
    const submit = await api(server, 'POST', '/api/leaderboard/submit', { gameId: 'x' }, g.token);
    expect(submit.status).toBe(403);
    expect((await api(server, 'POST', '/api/leaderboard/submit', { gameId: 'x' })).status).toBe(401);
    const board = await api<{ period: string; entries: unknown[] }>(server, 'GET', '/api/leaderboard?period=weekly&limit=5');
    expect(board.body).toEqual({ period: 'weekly', entries: [] });
    expect((await api(server, 'GET', '/api/leaderboard?period=bogus')).status).toBe(400);
  });

  it('keeps tournaments admin-only for writes', async () => {
    const g = await guest();
    expect((await api(server, 'POST', '/api/tournaments', { name: 'Cup', maxPlayers: 8 }, g.token)).status).toBe(403);
    expect((await api(server, 'POST', '/api/tournaments/abc/join', undefined, g.token)).status).toBe(403);
    expect((await api(server, 'GET', '/api/admin/users', undefined, g.token)).status).toBe(403);
  });
});

describe('Socket.io smoke (in-memory fallback)', () => {
  it('rejects sockets without a valid token', async () => {
    await expect(connectSocket(server, 'garbage')).rejects.toThrow(/UNAUTHORIZED/);
  });

  it('matches two queued players and plays a race to the end', async () => {
    const [a, b] = await Promise.all([guest('Ann'), guest('Ben')]);
    const sa = await open(a.token);
    const sb = await open(b.token);

    const startedA = once(sa, 'match:started');
    const startedB = once(sb, 'match:started');
    const queued = await emitAck<AckResponse<{ status: string; waiting?: number }>>(sa, '1v1:queue:join');
    expect(queued).toEqual({ ok: true, data: { status: 'queued', waiting: 1 } });
    const dup = await emitAck<AckResponse>(sa, '1v1:queue:join');
    expect(dup).toMatchObject({ ok: false, code: 'ALREADY_QUEUED' });
    await emitAck(sb, '1v1:queue:join');

    const [pa, pb] = (await Promise.all([startedA, startedB])) as [MatchStartedPayload, MatchStartedPayload];
    expect(pa.matchId).toBe(pb.matchId);
    expect(pa.opponent.username).toBe('Ben');
    expect(pb.opponent.username).toBe('Ann');
    expect(Object.keys(pa)).not.toContain('secretCode');

    const live = JSON.parse((await server.store.get(REDIS_KEYS.match(pa.matchId))) as string) as LiveMatch;

    const progress = once(sb, 'match:opponent_progress');
    const wrong = await emitAck<AckResponse<GuessResult>>(sa, 'match:guess', { matchId: pa.matchId, guess: WRONG });
    expect(wrong).toMatchObject({ ok: true, data: { row: 0, isWin: false, isGameOver: false } });
    const prog = await progress;
    expect(prog).toMatchObject({ matchId: pa.matchId, row: 0, attemptsUsed: 1 });
    expect(JSON.stringify(prog)).not.toContain('"P"');

    const endedA = once(sa, 'match:ended');
    const endedB = once(sb, 'match:ended');
    const win = await emitAck<AckResponse<GuessResult>>(sb, 'match:guess', { matchId: pa.matchId, guess: live.secret });
    expect(win).toMatchObject({ ok: true, data: { isWin: true, isGameOver: true, secretCode: live.secret } });

    const [ea, eb] = (await Promise.all([endedA, endedB])) as [MatchEndedPayload, MatchEndedPayload];
    expect(ea.winnerId).toBe(b.user.id);
    expect(eb.winnerId).toBe(b.user.id);
    expect(ea.reason).toBe('solved');
    expect(ea.secretCode).toEqual(live.secret);
    expect(eb.yourScore.total).toBeGreaterThan(1000);

    const late = await emitAck<AckResponse<GuessResult>>(sa, 'match:guess', { matchId: pa.matchId, guess: WRONG });
    expect(late).toMatchObject({ ok: false, code: 'MATCH_OVER' });
  });

  it('validates payloads and reports errors through acks', async () => {
    const a = await guest();
    const s = await open(a.token);
    const bad = await emitAck<AckResponse>(s, 'match:guess', { matchId: 'x', guess: ['R'] });
    expect(bad).toMatchObject({ ok: false, code: 'INVALID_PAYLOAD' });
    const missing = await emitAck<AckResponse>(s, 'match:guess', { matchId: 'nope', guess: WRONG });
    expect(missing).toMatchObject({ ok: false, code: 'NOT_FOUND' });
    const guestTournament = await emitAck<AckResponse>(s, 'tournament:match:join', {
      tournamentId: 't',
      tournamentMatchId: 'm',
    });
    expect(guestTournament).toMatchObject({ ok: false, code: 'FORBIDDEN' });
  });

  it('runs a private room challenge with a shareable code and a forfeit', async () => {
    const [h, g] = await Promise.all([guest('Host'), guest('Guest')]);
    const sh = await open(h.token);
    const sg = await open(g.token);

    const created = await emitAck<AckResponse<{ code: string }>>(sh, '1v1:room:create');
    expect(created.ok).toBe(true);
    const code = (created as { ok: true; data: { code: string } }).data.code;
    expect(code).toHaveLength(6);

    const missing = await emitAck<AckResponse<RoomStatePayload>>(sg, '1v1:room:join', { code: 'ZZZZZZ' });
    expect(missing).toMatchObject({ ok: false, code: 'ROOM_NOT_FOUND' });

    const startedHost = once(sh, 'match:started');
    const joined = await emitAck<AckResponse<RoomStatePayload>>(sg, '1v1:room:join', { code: code.toLowerCase() });
    expect(joined).toEqual({ ok: true, data: { code, status: 'started', players: 2 } });
    const started = (await startedHost) as MatchStartedPayload;
    expect(started.roomCode).toBe(code);

    const ended = once(sh, 'match:ended');
    expect(await emitAck(sg, 'match:forfeit', { matchId: started.matchId })).toEqual({ ok: true });
    expect(await ended).toMatchObject({ winnerId: h.user.id, reason: 'forfeit' });
  });

  it('forfeits an abandoned match after the grace period and supports reconnect', async () => {
    const short = await startTestServer();
    short.ctx.matches['timings'].graceMs = 150;
    try {
      const [a, b] = await Promise.all([
        api<AuthResponse>(short, 'POST', '/api/auth/guest', {}),
        api<AuthResponse>(short, 'POST', '/api/auth/guest', {}),
      ]);
      const sa = await connectSocket(short, a.body.token);
      let sb = await connectSocket(short, b.body.token);
      const startedA = once(sa, 'match:started');
      await emitAck(sa, '1v1:queue:join');
      await emitAck(sb, '1v1:queue:join');
      const started = (await startedA) as MatchStartedPayload;

      const status = once(sa, 'match:opponent_status');
      sb.disconnect();
      expect(await status).toMatchObject({ status: 'disconnected', graceMs: 150 });

      sb = createSocket(short, b.body.token);
      const resumedPromise = once(sb, 'match:started');
      const resumed = (await resumedPromise) as MatchStartedPayload;
      expect(resumed.matchId).toBe(started.matchId);
      expect(resumed.resume).toBeDefined();
      expect(await once(sa, 'match:opponent_status')).toMatchObject({ status: 'connected' });

      const ended = once(sa, 'match:ended');
      sb.disconnect();
      expect(await ended).toMatchObject({ winnerId: a.body.user.id, reason: 'disconnect' });
      sa.disconnect();
    } finally {
      await short.stop();
    }
  });
});
