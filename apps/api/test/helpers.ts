import type { ServerToClientEvents } from '@mastermind/shared';
import { DbAccess } from '../src/db';
import { silentLogger } from '../src/lib/logger';
import type { Realtime } from '../src/realtime';
import { MatchService, type MatchTimings, type PlayerInfo } from '../src/services/matches';
import { LeaderboardService } from '../src/services/leaderboard';
import { MatchmakingService } from '../src/services/matchmaking';
import { MemoryStore } from '../src/store';

export interface Emitted {
  userId: string;
  event: string;
  payload: unknown;
}

export class FakeRealtime implements Realtime {
  readonly emitted: Emitted[] = [];
  readonly online = new Set<string>();
  readonly tournamentEvents: { tournamentId: string; event: string; payload: unknown }[] = [];

  emitToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    this.emitted.push({ userId, event, payload });
  }

  emitToTournament<E extends keyof ServerToClientEvents>(
    tournamentId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    this.tournamentEvents.push({ tournamentId, event, payload });
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return this.online.has(userId);
  }

  setUserMatch(): void {
    /* no sockets in unit tests */
  }

  to(userId: string, event: string): Emitted[] {
    return this.emitted.filter((e) => e.userId === userId && e.event === event);
  }
}

export const player = (id: string, rating = 1000): PlayerInfo => ({
  userId: `g_${id}`,
  username: id,
  rating,
  isGuest: true,
});

export function createHarness(timings: Partial<MatchTimings> = {}) {
  const store = new MemoryStore();
  const realtime = new FakeRealtime();
  const db = new DbAccess(silentLogger);
  const leaderboard = new LeaderboardService(store, db, silentLogger);
  const full: MatchTimings = { countdownMs: 0, timeoutMs: 60_000, graceMs: 60_000, ...timings };
  const matches = new MatchService(store, realtime, db, leaderboard, silentLogger, full);
  const matchmaking = new MatchmakingService(store, realtime, matches, silentLogger);
  return { store, realtime, db, leaderboard, matches, matchmaking };
}
