import type { Server } from 'socket.io';
import {
  SOCKET_ROOMS,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
} from '@mastermind/shared';
import type { Realtime } from '../realtime';

export type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

type Emitter = { emit: (event: string, payload: unknown) => boolean };

export class SocketRealtime implements Realtime {
  constructor(private readonly io: AppServer) {}

  emitToUser<E extends keyof ServerToClientEvents>(
    userId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    (this.io.to(SOCKET_ROOMS.user(userId)) as unknown as Emitter).emit(event, payload);
  }

  emitToTournament<E extends keyof ServerToClientEvents>(
    tournamentId: string,
    event: E,
    payload: Parameters<ServerToClientEvents[E]>[0],
  ): void {
    (this.io.to(SOCKET_ROOMS.tournament(tournamentId)) as unknown as Emitter).emit(event, payload);
  }

  async isUserOnline(userId: string): Promise<boolean> {
    return (this.io.sockets.adapter.rooms.get(SOCKET_ROOMS.user(userId))?.size ?? 0) > 0;
  }

  setUserMatch(userId: string, matchId?: string, roomCode?: string): void {
    const ids = this.io.sockets.adapter.rooms.get(SOCKET_ROOMS.user(userId));
    if (!ids) return;
    for (const id of ids) {
      const socket = this.io.sockets.sockets.get(id);
      if (!socket) continue;
      if (matchId === undefined) delete socket.data.matchId;
      else socket.data.matchId = matchId;
      if (roomCode === undefined) delete socket.data.roomCode;
      else socket.data.roomCode = roomCode;
    }
  }
}
