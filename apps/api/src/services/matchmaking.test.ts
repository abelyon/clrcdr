import { describe, expect, it } from 'vitest';
import type { MatchStartedPayload, RoomStatePayload } from '@mastermind/shared';
import { createHarness, player } from '../../test/helpers';

function setup() {
  const h = createHarness();
  const players = ['a', 'b', 'c', 'd'].map((n) => player(n));
  for (const p of players) h.realtime.online.add(p.userId);
  return { h, players };
}

describe('quick match queue', () => {
  it('queues the first player and pairs the second', async () => {
    const { h, players } = setup();
    const [a, b] = players as [ReturnType<typeof player>, ReturnType<typeof player>];

    expect(await h.matchmaking.join(a)).toEqual({ status: 'queued', waiting: 1 });
    expect(h.realtime.to(a.userId, '1v1:queue:status').at(-1)?.payload).toEqual({ status: 'queued', waiting: 1 });

    expect(await h.matchmaking.join(b)).toEqual({ status: 'idle' });
    const startedA = h.realtime.to(a.userId, 'match:started')[0]?.payload as MatchStartedPayload;
    const startedB = h.realtime.to(b.userId, 'match:started')[0]?.payload as MatchStartedPayload;
    expect(startedA.matchId).toBe(startedB.matchId);
    expect(startedA.opponent.id).toBe(b.userId);
    expect(startedB.opponent.id).toBe(a.userId);
    expect(h.realtime.to(a.userId, '1v1:queue:status').at(-1)?.payload).toEqual({ status: 'idle' });
    expect(await h.store.llen('1v1:queue')).toBe(0);
  });

  it('rejects duplicate joins and joins while playing', async () => {
    const { h, players } = setup();
    const [a, b] = players as [ReturnType<typeof player>, ReturnType<typeof player>];
    await h.matchmaking.join(a);
    await expect(h.matchmaking.join(a)).rejects.toMatchObject({ code: 'ALREADY_QUEUED' });
    await h.matchmaking.join(b);
    await expect(h.matchmaking.join(a)).rejects.toMatchObject({ code: 'ALREADY_IN_MATCH' });
  });

  it('lets players leave the queue and skips offline entries', async () => {
    const { h, players } = setup();
    const [a, b, c] = players as [ReturnType<typeof player>, ReturnType<typeof player>, ReturnType<typeof player>];
    await h.matchmaking.join(a);
    expect(await h.matchmaking.leave(a.userId)).toBe(true);
    expect(await h.matchmaking.leave(a.userId)).toBe(false);

    await h.matchmaking.join(b);
    h.realtime.online.delete(b.userId);
    expect(await h.matchmaking.join(c)).toEqual({ status: 'queued', waiting: 1 });
    expect(h.realtime.to(b.userId, 'match:started')).toHaveLength(0);
  });

  it('pairs a longer queue in arrival order', async () => {
    const { h, players } = setup();
    for (const p of players) await h.matchmaking.join(p);
    const [a, b, c, d] = players as ReturnType<typeof player>[] as [
      ReturnType<typeof player>,
      ReturnType<typeof player>,
      ReturnType<typeof player>,
      ReturnType<typeof player>,
    ];
    const opp = (u: typeof a) =>
      (h.realtime.to(u.userId, 'match:started')[0]?.payload as MatchStartedPayload).opponent.id;
    expect(opp(a)).toBe(b.userId);
    expect(opp(c)).toBe(d.userId);
  });
});

describe('private rooms', () => {
  it('creates a room code and starts a match when a second player joins', async () => {
    const { h, players } = setup();
    const [host, guest] = players as [ReturnType<typeof player>, ReturnType<typeof player>];
    const { code } = await h.matchmaking.createRoom(host);
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{6}$/);
    expect(h.realtime.to(host.userId, '1v1:room:created')[0]?.payload).toEqual({ code });
    expect(h.realtime.to(host.userId, '1v1:room:state')[0]?.payload).toEqual({ code, status: 'waiting', players: 1 });

    const state = await h.matchmaking.joinRoom(guest, code.toLowerCase());
    expect(state).toEqual<RoomStatePayload>({ code, status: 'started', players: 2 });
    const started = h.realtime.to(host.userId, 'match:started')[0]?.payload as MatchStartedPayload;
    expect(started).toMatchObject({ roomCode: code, mode: '1V1' });
    expect(started.opponent.id).toBe(guest.userId);
  });

  it('reports unknown, full, own and abandoned rooms', async () => {
    const { h, players } = setup();
    const [host, guest, third] = players as [ReturnType<typeof player>, ReturnType<typeof player>, ReturnType<typeof player>];
    await expect(h.matchmaking.joinRoom(guest, 'ABCDEF')).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });

    const { code } = await h.matchmaking.createRoom(host);
    await expect(h.matchmaking.joinRoom(host, code)).rejects.toMatchObject({ code: 'INVALID_PAYLOAD' });
    await h.matchmaking.joinRoom(guest, code);
    await expect(h.matchmaking.joinRoom(third, code)).rejects.toMatchObject({ code: 'ROOM_FULL' });

    const fresh = player('x');
    h.realtime.online.add(fresh.userId);
    const { code: code2 } = await h.matchmaking.createRoom(fresh);
    h.realtime.online.delete(fresh.userId);
    await expect(h.matchmaking.joinRoom(third, code2)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
  });

  it('closes the previous room when hosting again or on demand', async () => {
    const { h, players } = setup();
    const [host, guest] = players as [ReturnType<typeof player>, ReturnType<typeof player>];
    const first = await h.matchmaking.createRoom(host);
    const second = await h.matchmaking.createRoom(host);
    expect(second.code).not.toBe(first.code);
    await expect(h.matchmaking.joinRoom(guest, first.code)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
    await h.matchmaking.closeRoom(host.userId);
    await expect(h.matchmaking.joinRoom(guest, second.code)).rejects.toMatchObject({ code: 'ROOM_NOT_FOUND' });
    expect(h.realtime.to(host.userId, '1v1:room:state').at(-1)?.payload).toMatchObject({ status: 'closed' });
  });
});
