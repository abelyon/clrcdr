import type { MatchMode, UserRole } from './constants';
import type { PegColor } from './constants';
import type {
  BracketMatch,
  GuessResult,
  MatchGuessPayload,
  MatchRefPayload,
  OpponentInfo,
  RoomJoinPayload,
  TournamentDetail,
  TournamentMatchJoinPayload,
  TournamentRefPayload,
} from './schemas';
import type { ScoreBreakdown } from './game';

export type AckResponse<T = undefined> =
  | (T extends undefined ? { ok: true } : { ok: true; data: T })
  | { ok: false; error: string; code?: SocketErrorCode };

export type Ack<T = undefined> = (response: AckResponse<T>) => void;

export type SocketErrorCode =
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'INVALID_PAYLOAD'
  | 'NOT_FOUND'
  | 'ALREADY_IN_MATCH'
  | 'ALREADY_QUEUED'
  | 'ROOM_FULL'
  | 'ROOM_NOT_FOUND'
  | 'MATCH_OVER'
  | 'NOT_YOUR_MATCH'
  | 'MATCH_NOT_READY'
  | 'RATE_LIMITED'
  | 'INTERNAL';

export interface MatchStartedPayload {
  matchId: string;
  mode: MatchMode;
  codeLength: number;
  maxAttempts: number;
  palette: readonly PegColor[];
  /** Epoch ms when both players may start guessing (server clock). */
  startedAt: number;
  opponent: OpponentInfo;
  roomCode?: string;
  tournamentId?: string;
  tournamentMatchId?: string;
}

/** Telemetry about the opponent. Intentionally contains no colors. */
export interface OpponentProgressPayload {
  matchId: string;
  /** 0-based index of the row the opponent just submitted. */
  row: number;
  exact: number;
  partial: number;
  attemptsUsed: number;
  elapsedMs: number;
}

export type MatchEndReason = 'solved' | 'exhausted' | 'forfeit' | 'disconnect' | 'timeout';

export interface MatchEndedPayload {
  matchId: string;
  winnerId: string | null;
  reason: MatchEndReason;
  /** Always revealed at match end. */
  secretCode: PegColor[];
  yourScore: ScoreBreakdown;
  opponentScore: ScoreBreakdown;
  durationMs: number;
  ratingChange: number | null;
  newRating: number | null;
  tournamentId?: string;
}

export interface QueueStatusPayload {
  status: 'idle' | 'queued';
  /** Players currently waiting in queue (including you). */
  waiting?: number;
}

export interface RoomCreatedPayload {
  code: string;
}

export interface RoomStatePayload {
  code: string;
  status: 'waiting' | 'full' | 'started' | 'closed';
  players: number;
}

export interface TournamentBracketUpdatedPayload {
  tournamentId: string;
  status: TournamentDetail['status'];
  matches: BracketMatch[];
  winnerId: string | null;
}

export interface TournamentMatchReadyPayload {
  tournamentId: string;
  tournamentMatchId: string;
  round: number;
  opponent: OpponentInfo | null;
}

export interface MatchErrorPayload {
  matchId?: string;
  code: SocketErrorCode;
  message: string;
}

export interface ClientToServerEvents {
  '1v1:queue:join': (ack?: Ack<QueueStatusPayload>) => void;
  '1v1:queue:leave': (ack?: Ack) => void;
  '1v1:room:create': (ack?: Ack<RoomCreatedPayload>) => void;
  '1v1:room:join': (payload: RoomJoinPayload, ack?: Ack<RoomStatePayload>) => void;
  'match:guess': (payload: MatchGuessPayload, ack?: Ack<GuessResult>) => void;
  /** Re-attach to an active match after a reconnect; server replays match state. */
  'match:rejoin': (payload: MatchRefPayload, ack?: Ack<MatchStartedPayload>) => void;
  'match:forfeit': (payload: MatchRefPayload, ack?: Ack) => void;
  'tournament:match:join': (
    payload: TournamentMatchJoinPayload,
    ack?: Ack<MatchStartedPayload>,
  ) => void;
  'tournament:subscribe': (payload: TournamentRefPayload, ack?: Ack) => void;
  'tournament:unsubscribe': (payload: TournamentRefPayload, ack?: Ack) => void;
}

export interface ServerToClientEvents {
  '1v1:queue:status': (payload: QueueStatusPayload) => void;
  '1v1:room:created': (payload: RoomCreatedPayload) => void;
  '1v1:room:state': (payload: RoomStatePayload) => void;
  'match:started': (payload: MatchStartedPayload) => void;
  'match:guess_result': (payload: { matchId: string; result: GuessResult }) => void;
  'match:opponent_progress': (payload: OpponentProgressPayload) => void;
  'match:opponent_status': (payload: {
    matchId: string;
    status: 'connected' | 'disconnected';
    graceMs?: number;
  }) => void;
  'match:ended': (payload: MatchEndedPayload) => void;
  'match:error': (payload: MatchErrorPayload) => void;
  'tournament:match:ready': (payload: TournamentMatchReadyPayload) => void;
  'tournament:bracket_updated': (payload: TournamentBracketUpdatedPayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
  'match:sync': (payload: { matchId: string }) => void;
  'tournament:sync': (payload: { tournamentId: string }) => void;
}

export interface SocketData {
  userId: string;
  username: string;
  role: UserRole;
  isGuest: boolean;
  rating: number;
  /** Active match this socket participates in, if any. */
  matchId?: string;
  roomCode?: string;
}

/** Names of all socket events, handy for generic logging / rate limiting. */
export const CLIENT_EVENT_NAMES = [
  '1v1:queue:join',
  '1v1:queue:leave',
  '1v1:room:create',
  '1v1:room:join',
  'match:guess',
  'match:rejoin',
  'match:forfeit',
  'tournament:match:join',
  'tournament:subscribe',
  'tournament:unsubscribe',
] as const satisfies readonly (keyof ClientToServerEvents)[];

export const SERVER_EVENT_NAMES = [
  '1v1:queue:status',
  '1v1:room:created',
  '1v1:room:state',
  'match:started',
  'match:guess_result',
  'match:opponent_progress',
  'match:opponent_status',
  'match:ended',
  'match:error',
  'tournament:match:ready',
  'tournament:bracket_updated',
] as const satisfies readonly (keyof ServerToClientEvents)[];
