import { z } from "zod";
import type { Code, GameConfig } from "./config";
import type { Feedback } from "./feedback";
import type { TournamentBracketDto, TournamentMatchDto } from "./tournament";

/**
 * Typed Socket.io contracts shared by `apps/api` and `apps/web`.
 *
 * Anti-cheat invariants:
 *  - No event before game end carries a secret or any guess colors of the opponent.
 *  - The only per-guess data a player receives is `Feedback`; the opponent's
 *    progress is limited to row index + peg counts (`OpponentProgress`).
 *  - `secret` is only present on `GameEndPayload`, i.e. after the game is over.
 */

export type RoomId = string;

export type GameEndReason =
  | "solved"
  | "attempts_exhausted"
  | "opponent_solved"
  | "opponent_forfeit"
  | "opponent_disconnected";

export interface QueueJoinPayload {
  /** Desired config; the server may normalise or ignore it. */
  config?: Partial<GameConfig>;
}

export interface RoomJoinPayload {
  inviteCode: string;
}

export interface GuessPayload {
  roomId: RoomId;
  guess: Code;
}

export interface TournamentSubscribePayload {
  tournamentId: string;
}

export interface RoomCreatedPayload {
  roomId: RoomId;
  inviteCode: string;
  config: GameConfig;
}

export interface MatchFoundPayload {
  roomId: RoomId;
  config: GameConfig;
  opponent: { id: string; username: string };
}

export interface GameStartPayload {
  roomId: RoomId;
  config: GameConfig;
  /** Epoch ms; both players race against the same secret from this instant. */
  startedAt: number;
}

export interface GuessFeedbackPayload extends Feedback {
  roomId: RoomId;
  /** Zero-based row of the guess this feedback belongs to. */
  row: number;
}

/** Opponent telemetry: deliberately has no colors, guess or secret fields. */
export const opponentProgressSchema = z
  .object({
    roomId: z.string().min(1),
    row: z.number().int().min(0),
    exact: z.number().int().min(0),
    partial: z.number().int().min(0),
    isWin: z.boolean(),
  })
  .strict();
export type OpponentProgress = z.infer<typeof opponentProgressSchema>;

export interface OpponentConnectionPayload {
  roomId: RoomId;
  /** Remaining reconnect window in ms (60s disconnect timer). Present when disconnected. */
  graceMs?: number;
}

export interface GameEndPayload {
  roomId: RoomId;
  reason: GameEndReason;
  winnerId: string | null;
  /** Revealed only now that the game is over. */
  secret: Code;
}

export interface TournamentMatchUpdatePayload {
  tournamentId: string;
  match: TournamentMatchDto;
}

export interface TournamentBracketPayload {
  bracket: TournamentBracketDto;
}

export type SocketErrorCode =
  | "unauthorized"
  | "invalid_payload"
  | "room_not_found"
  | "invite_invalid"
  | "not_in_room"
  | "game_over"
  | "rate_limited"
  | "internal";

export interface SocketErrorPayload {
  code: SocketErrorCode;
  message: string;
}

export type CreateRoomAck = (res: { ok: true; data: RoomCreatedPayload } | { ok: false; error: SocketErrorPayload }) => void;
export type GuessAck = (res: { ok: true; data: GuessFeedbackPayload } | { ok: false; error: SocketErrorPayload }) => void;

export interface ServerToClientEvents {
  "queue:waiting": (payload: { position?: number }) => void;
  "queue:matched": (payload: MatchFoundPayload) => void;
  "room:joined": (payload: MatchFoundPayload) => void;
  "game:start": (payload: GameStartPayload) => void;
  "game:feedback": (payload: GuessFeedbackPayload) => void;
  "game:opponentProgress": (payload: OpponentProgress) => void;
  "game:end": (payload: GameEndPayload) => void;
  "opponent:disconnected": (payload: OpponentConnectionPayload) => void;
  "opponent:reconnected": (payload: OpponentConnectionPayload) => void;
  "tournament:bracket": (payload: TournamentBracketPayload) => void;
  "tournament:matchUpdate": (payload: TournamentMatchUpdatePayload) => void;
  error: (payload: SocketErrorPayload) => void;
}

export interface ClientToServerEvents {
  "queue:join": (payload: QueueJoinPayload) => void;
  "queue:leave": () => void;
  "room:create": (payload: QueueJoinPayload, ack: CreateRoomAck) => void;
  "room:join": (payload: RoomJoinPayload) => void;
  "room:leave": (payload: { roomId: RoomId }) => void;
  "game:guess": (payload: GuessPayload, ack?: GuessAck) => void;
  "tournament:subscribe": (payload: TournamentSubscribePayload) => void;
  "tournament:unsubscribe": (payload: TournamentSubscribePayload) => void;
}

export interface InterServerEvents {
  ping: () => void;
}

export interface SocketData {
  userId: string;
  username: string;
  roomId?: RoomId;
}

export const SOCKET_EVENTS = {
  client: [
    "queue:join",
    "queue:leave",
    "room:create",
    "room:join",
    "room:leave",
    "game:guess",
    "tournament:subscribe",
    "tournament:unsubscribe",
  ],
  server: [
    "queue:waiting",
    "queue:matched",
    "room:joined",
    "game:start",
    "game:feedback",
    "game:opponentProgress",
    "game:end",
    "opponent:disconnected",
    "opponent:reconnected",
    "tournament:bracket",
    "tournament:matchUpdate",
    "error",
  ],
} as const satisfies { client: readonly (keyof ClientToServerEvents)[]; server: readonly (keyof ServerToClientEvents)[] };

export const DISCONNECT_GRACE_MS = 60_000;

/** Builds the telemetry sent to the opponent from a player's feedback (drops everything else). */
export function toOpponentProgress(roomId: RoomId, row: number, feedback: Feedback): OpponentProgress {
  return {
    roomId,
    row,
    exact: feedback.exact,
    partial: feedback.partial,
    isWin: feedback.isWin,
  };
}
