import { REDIS_KEYS, type QueueStatusPayload, type RoomStatePayload } from '@mastermind/shared';
import { newRoomCode } from '../game/random';
import type { Logger } from '../lib/logger';
import { KeyedMutex } from '../lib/mutex';
import type { Realtime } from '../realtime';
import type { Store } from '../store';
import { MatchError, type MatchService, type PlayerInfo } from './matches';

const ROOM_TTL_SEC = 30 * 60;
const STARTED_ROOM_TTL_SEC = 120;

interface RoomRecord {
  code: string;
  host: PlayerInfo;
  status: 'waiting' | 'started';
}

interface QueueEntry extends PlayerInfo {
  joinedAt: number;
}

const userRoomKey = (userId: string) => `userroom:${userId}`;

/** Instant quick-match queue and private room codes for 1v1 duels. */
export class MatchmakingService {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly store: Store,
    private readonly realtime: Realtime,
    private readonly matches: MatchService,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  private async queueEntries(): Promise<{ raw: string; entry: QueueEntry }[]> {
    const raws = await this.store.lrange(REDIS_KEYS.queue, 0, -1);
    const out: { raw: string; entry: QueueEntry }[] = [];
    for (const raw of raws) {
      try {
        out.push({ raw, entry: JSON.parse(raw) as QueueEntry });
      } catch {
        await this.store.lrem(REDIS_KEYS.queue, raw);
      }
    }
    return out;
  }

  async isQueued(userId: string): Promise<boolean> {
    return (await this.queueEntries()).some((e) => e.entry.userId === userId);
  }

  /** Adds the player to the queue and pairs the two longest-waiting players when possible. */
  join(player: PlayerInfo): Promise<QueueStatusPayload> {
    return this.mutex.run('queue', async () => {
      if (await this.matches.activeMatchOf(player.userId)) {
        throw new MatchError('ALREADY_IN_MATCH', 'You are already in a match');
      }
      if (await this.isQueued(player.userId)) throw new MatchError('ALREADY_QUEUED', 'You are already in the queue');
      await this.closeRoomLocked(player.userId);

      const entry: QueueEntry = { ...player, joinedAt: this.now() };
      await this.store.rpush(REDIS_KEYS.queue, JSON.stringify(entry));
      await this.pairLocked();

      if (await this.matches.activeMatchOf(player.userId)) return { status: 'idle' };
      const waiting = await this.store.llen(REDIS_KEYS.queue);
      const status: QueueStatusPayload = { status: 'queued', waiting };
      this.realtime.emitToUser(player.userId, '1v1:queue:status', status);
      return status;
    });
  }

  private async pairLocked(): Promise<void> {
    for (;;) {
      const live: { raw: string; entry: QueueEntry }[] = [];
      for (const item of await this.queueEntries()) {
        if (await this.realtime.isUserOnline(item.entry.userId)) live.push(item);
        else await this.store.lrem(REDIS_KEYS.queue, item.raw);
      }
      if (live.length < 2) return;

      const first = live[0] as (typeof live)[number];
      const second = live.find((item) => item.entry.userId !== first.entry.userId);
      if (!second) return;
      await this.store.lrem(REDIS_KEYS.queue, first.raw);
      await this.store.lrem(REDIS_KEYS.queue, second.raw);

      const toInfo = (e: QueueEntry): PlayerInfo => ({
        userId: e.userId,
        username: e.username,
        rating: e.rating,
        isGuest: e.isGuest,
      });
      try {
        await this.matches.startMatch({ mode: '1V1', players: [toInfo(first.entry), toInfo(second.entry)] });
        for (const e of [first.entry, second.entry]) {
          this.realtime.emitToUser(e.userId, '1v1:queue:status', { status: 'idle' });
        }
      } catch (error) {
        this.logger.warn(`[matchmaking] could not start match: ${String(error)}`);
        for (const item of [first, second]) {
          if (!(await this.matches.activeMatchOf(item.entry.userId))) {
            await this.store.rpush(REDIS_KEYS.queue, item.raw);
          }
        }
        return;
      }
    }
  }

  /** Removes the player from the queue. Returns true when they were queued. */
  leave(userId: string, notify = true): Promise<boolean> {
    return this.mutex.run('queue', async () => {
      let removed = false;
      for (const item of await this.queueEntries()) {
        if (item.entry.userId === userId) {
          await this.store.lrem(REDIS_KEYS.queue, item.raw);
          removed = true;
        }
      }
      if (notify) this.realtime.emitToUser(userId, '1v1:queue:status', { status: 'idle' });
      return removed;
    });
  }

  async createRoom(host: PlayerInfo): Promise<{ code: string }> {
    return this.mutex.run('queue', async () => {
      if (await this.matches.activeMatchOf(host.userId)) {
        throw new MatchError('ALREADY_IN_MATCH', 'You are already in a match');
      }
      for (const item of await this.queueEntries()) {
        if (item.entry.userId === host.userId) await this.store.lrem(REDIS_KEYS.queue, item.raw);
      }
      await this.closeRoomLocked(host.userId);

      const record: RoomRecord = { code: '', host, status: 'waiting' };
      let code = '';
      for (let attempt = 0; attempt < 10; attempt++) {
        const candidate = newRoomCode();
        record.code = candidate;
        if (await this.store.setNx(REDIS_KEYS.room(candidate), JSON.stringify(record), ROOM_TTL_SEC)) {
          code = candidate;
          break;
        }
      }
      if (!code) throw new MatchError('INTERNAL', 'Could not allocate a room code');

      await this.store.set(userRoomKey(host.userId), code, ROOM_TTL_SEC);
      this.realtime.emitToUser(host.userId, '1v1:room:created', { code });
      this.realtime.emitToUser(host.userId, '1v1:room:state', { code, status: 'waiting', players: 1 });
      return { code };
    });
  }

  async joinRoom(guest: PlayerInfo, rawCode: string): Promise<RoomStatePayload> {
    const code = rawCode.trim().toUpperCase();
    return this.mutex.run(`room:${code}`, async () => {
      const raw = await this.store.get(REDIS_KEYS.room(code));
      if (!raw) throw new MatchError('ROOM_NOT_FOUND', 'Room not found or expired');
      const room = JSON.parse(raw) as RoomRecord;
      if (room.status !== 'waiting') throw new MatchError('ROOM_FULL', 'Room is already full');
      if (room.host.userId === guest.userId) {
        throw new MatchError('INVALID_PAYLOAD', 'You cannot join your own room');
      }
      if (!(await this.realtime.isUserOnline(room.host.userId))) {
        await this.store.del(REDIS_KEYS.room(code), userRoomKey(room.host.userId));
        throw new MatchError('ROOM_NOT_FOUND', 'The host left this room');
      }
      if (await this.matches.activeMatchOf(guest.userId)) {
        throw new MatchError('ALREADY_IN_MATCH', 'You are already in a match');
      }
      await this.leave(guest.userId, false);

      await this.matches.startMatch({ mode: '1V1', players: [room.host, guest], roomCode: code });
      room.status = 'started';
      await this.store.set(REDIS_KEYS.room(code), JSON.stringify(room), STARTED_ROOM_TTL_SEC);
      await this.store.del(userRoomKey(room.host.userId));

      const state: RoomStatePayload = { code, status: 'started', players: 2 };
      this.realtime.emitToUser(room.host.userId, '1v1:room:state', state);
      this.realtime.emitToUser(guest.userId, '1v1:room:state', state);
      return state;
    });
  }

  /** Closes the waiting room hosted by the user (on disconnect or when creating a new one). */
  closeRoom(userId: string): Promise<void> {
    return this.mutex.run('queue', () => this.closeRoomLocked(userId));
  }

  private async closeRoomLocked(userId: string): Promise<void> {
    const code = await this.store.get(userRoomKey(userId));
    if (!code) return;
    const raw = await this.store.get(REDIS_KEYS.room(code));
    await this.store.del(userRoomKey(userId));
    if (!raw) return;
    const room = JSON.parse(raw) as RoomRecord;
    if (room.host.userId === userId && room.status === 'waiting') {
      await this.store.del(REDIS_KEYS.room(code));
      this.realtime.emitToUser(userId, '1v1:room:state', { code, status: 'closed', players: 0 });
    }
  }
}
