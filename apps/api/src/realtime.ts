import type { ServerToClientEvents } from '@mastermind/shared';

type Payload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

/** Outbound realtime surface used by services; implemented by the Socket.io layer (and by a fake in tests). */
export interface Realtime {
  emitToUser<E extends keyof ServerToClientEvents>(userId: string, event: E, payload: Payload<E>): void;
  emitToTournament<E extends keyof ServerToClientEvents>(
    tournamentId: string,
    event: E,
    payload: Payload<E>,
  ): void;
  isUserOnline(userId: string): Promise<boolean>;
  /** Records the active match / room on every socket of the user. */
  setUserMatch(userId: string, matchId?: string, roomCode?: string): void;
}
