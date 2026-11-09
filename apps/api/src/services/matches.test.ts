import { afterEach, describe, expect, it, vi } from 'vitest';
import { REDIS_KEYS, MAX_ATTEMPTS, type MatchEndedPayload, type MatchStartedPayload, type PegColor } from '@mastermind/shared';
import type { LiveMatch } from '../game/match-logic';
import { createHarness, player } from '../../test/helpers';
import { MatchError } from './matches';

const WRONG: PegColor[] = ['P', 'P', 'O', 'O'];

async function secretOf(h: ReturnType<typeof createHarness>, matchId: string): Promise<PegColor[]> {
  const raw = await h.store.get(REDIS_KEYS.match(matchId));
  return (JSON.parse(raw as string) as LiveMatch).secret;
}

function setup(timings = {}) {
  const h = createHarness(timings);
  const a = player('alice');
  const b = player('bob');
  h.realtime.online.add(a.userId);
  h.realtime.online.add(b.userId);
  return { h, a, b };
}

afterEach(() => vi.useRealTimers());

describe('MatchService', () => {
  it('starts a match without exposing the secret', async () => {
    const { h, a, b } = setup();
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    const [started] = h.realtime.to(a.userId, 'match:started');
    const payload = started?.payload as MatchStartedPayload;
    expect(payload.matchId).toBe(match.id);
    expect(payload.opponent.id).toBe(b.userId);
    expect(payload.maxAttempts).toBe(MAX_ATTEMPTS);
    expect(JSON.stringify(h.realtime.emitted)).not.toContain(match.secret.join('","'));
    expect(payload).not.toHaveProperty('secretCode');
    expect(await h.matches.activeMatchOf(a.userId)).not.toBeNull();
  });

  it('refuses a second match for a player already playing', async () => {
    const { h, a, b } = setup();
    await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    await expect(h.matches.startMatch({ mode: '1V1', players: [a, player('carol')] })).rejects.toMatchObject({
      code: 'ALREADY_IN_MATCH',
    });
  });

  it('shares only counts with the opponent and ends on the first solve', async () => {
    const { h, a, b } = setup();
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    const secret = await secretOf(h, match.id);

    const first = await h.matches.guess(a.userId, match.id, WRONG);
    expect(first).toMatchObject({ row: 0, isWin: false, isGameOver: false });
    expect(first).not.toHaveProperty('secretCode');

    const progress = h.realtime.to(b.userId, 'match:opponent_progress');
    expect(progress).toHaveLength(1);
    expect(Object.keys(progress[0]?.payload as object).sort()).toEqual(
      ['attemptsUsed', 'elapsedMs', 'exact', 'matchId', 'partial', 'row'].sort(),
    );
    expect(h.realtime.to(b.userId, 'match:ended')).toHaveLength(0);

    const win = await h.matches.guess(b.userId, match.id, secret as PegColor[]);
    expect(win).toMatchObject({ isWin: true, isGameOver: true, secretCode: secret });
    expect(win.score?.total).toBeGreaterThan(1000);

    const endedA = h.realtime.to(a.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    const endedB = h.realtime.to(b.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    expect(endedA.winnerId).toBe(b.userId);
    expect(endedA.reason).toBe('solved');
    expect(endedA.secretCode).toEqual(secret);
    expect(endedA.yourScore.total).toBe(0);
    expect(endedB.yourScore.total).toBe(win.score?.total);
    expect(endedA.ratingChange).toBeNull();
    expect(await h.matches.activeMatchOf(a.userId)).toBeNull();

    await expect(h.matches.guess(a.userId, match.id, WRONG)).rejects.toMatchObject({ code: 'MATCH_OVER' });
  });

  it('keeps the secret hidden from a player who ran out of attempts until the match ends', async () => {
    const { h, a, b } = setup();
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    let last;
    for (let i = 0; i < MAX_ATTEMPTS; i++) last = await h.matches.guess(a.userId, match.id, WRONG);
    expect(last).toMatchObject({ isGameOver: false });
    expect(last).not.toHaveProperty('secretCode');
    await expect(h.matches.guess(a.userId, match.id, WRONG)).rejects.toMatchObject({ code: 'MATCH_OVER' });

    for (let i = 0; i < MAX_ATTEMPTS - 1; i++) await h.matches.guess(b.userId, match.id, WRONG);
    const finish = await h.matches.guess(b.userId, match.id, WRONG);
    expect(finish.isGameOver).toBe(true);
    expect(finish.secretCode).toHaveLength(4);
    const ended = h.realtime.to(a.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    expect(ended.reason).toBe('exhausted');
    expect([a.userId, null]).toContain(ended.winnerId);
  });

  it('rejects guesses before the countdown finishes and from outsiders', async () => {
    const { h, a, b } = setup({ countdownMs: 60_000 });
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    await expect(h.matches.guess(a.userId, match.id, WRONG)).rejects.toMatchObject({ code: 'MATCH_NOT_READY' });
    await expect(h.matches.guess('g_eve', match.id, WRONG)).rejects.toMatchObject({ code: 'NOT_YOUR_MATCH' });
    await expect(h.matches.guess(a.userId, 'missing', WRONG)).rejects.toBeInstanceOf(MatchError);
  });

  it('ends the match on forfeit with the opponent as winner', async () => {
    const { h, a, b } = setup();
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    await h.matches.forfeit(a.userId, match.id);
    const ended = h.realtime.to(b.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    expect(ended).toMatchObject({ winnerId: b.userId, reason: 'forfeit' });
  });

  it('abandons a match when a player stays disconnected past the grace period', async () => {
    vi.useFakeTimers();
    const { h, a, b } = setup({ graceMs: 5000 });
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    h.realtime.online.delete(a.userId);
    await h.matches.onUserDisconnected(a.userId);
    const status = h.realtime.to(b.userId, 'match:opponent_status')[0]?.payload;
    expect(status).toMatchObject({ status: 'disconnected', graceMs: 5000 });

    await vi.advanceTimersByTimeAsync(5001);
    const ended = h.realtime.to(b.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    expect(ended).toMatchObject({ winnerId: b.userId, reason: 'disconnect', matchId: match.id });
  });

  it('keeps the match when the player reconnects in time and replays state', async () => {
    vi.useFakeTimers();
    const { h, a, b } = setup({ graceMs: 5000 });
    const match = await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    await h.matches.guess(a.userId, match.id, WRONG);
    h.realtime.online.delete(a.userId);
    await h.matches.onUserDisconnected(a.userId);

    h.realtime.online.add(a.userId);
    await h.matches.onUserConnected(a.userId);
    await vi.advanceTimersByTimeAsync(6000);
    expect(h.realtime.to(b.userId, 'match:ended')).toHaveLength(0);

    const resumed = h.realtime.to(a.userId, 'match:started').at(-1)?.payload as MatchStartedPayload;
    expect(resumed.resume?.yourGuesses).toHaveLength(1);
    expect(resumed.resume?.yourGuesses[0]?.guess).toEqual(WRONG);
    const rejoin = await h.matches.rejoin(b.userId, match.id);
    expect(rejoin.resume?.opponentRows).toEqual([
      { row: 0, exact: expect.any(Number), partial: expect.any(Number) },
    ]);
    expect(JSON.stringify(rejoin.resume?.opponentRows)).not.toContain('"P"');
  });

  it('times out an unfinished match using the progress tie-break', async () => {
    vi.useFakeTimers();
    const { h, a, b } = setup({ timeoutMs: 10_000 });
    await h.matches.startMatch({ mode: '1V1', players: [a, b] });
    await vi.advanceTimersByTimeAsync(10_001);
    const ended = h.realtime.to(a.userId, 'match:ended')[0]?.payload as MatchEndedPayload;
    expect(ended).toMatchObject({ reason: 'timeout', winnerId: null });
  });
});
