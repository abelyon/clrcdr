import type {
  GuessRecord,
  GuessResult,
  MatchEndedPayload,
  MatchStartedPayload,
  OpponentProgressPayload,
  PegColor,
} from '@mastermind/shared';
import {
  clearRow,
  commitRow,
  createBoard,
  isRowComplete,
  placePeg,
  removePeg,
  toggleSlot,
  type BoardState,
} from './board';

/** Match start payload; `resume` is sent by the server when re-attaching after a reconnect. */
export type MatchStart = MatchStartedPayload & {
  resume?: {
    yourGuesses: GuessRecord[];
    opponentRows: { row: number; exact: number; partial: number }[];
  };
};

export interface OpponentRow {
  exact: number;
  partial: number;
  atMs: number | null;
}

export interface MatchViewState {
  match: MatchStart | null;
  board: BoardState;
  /** Guess currently awaiting server feedback. */
  pending: PegColor[] | null;
  opponentRows: OpponentRow[];
  opponentConnected: boolean;
  /** Epoch ms (local clock) when the opponent's reconnect grace period ends. */
  graceEndsAt: number | null;
  secret: PegColor[] | null;
  /** Result of my last accepted guess. */
  lastResult: GuessResult | null;
  ended: MatchEndedPayload | null;
}

export type MatchAction =
  | { type: 'started'; payload: MatchStart }
  | { type: 'place'; color: PegColor }
  | { type: 'remove' }
  | { type: 'clear' }
  | { type: 'toggle'; index: number }
  | { type: 'submitting' }
  | { type: 'guessResult'; result: GuessResult }
  | { type: 'guessFailed' }
  | { type: 'opponentProgress'; payload: OpponentProgressPayload }
  | { type: 'opponentStatus'; status: 'connected' | 'disconnected'; graceMs?: number; now?: number }
  | { type: 'ended'; payload: MatchEndedPayload }
  | { type: 'reset' };

export function initialMatchState(): MatchViewState {
  return {
    match: null,
    board: createBoard(),
    pending: null,
    opponentRows: [],
    opponentConnected: true,
    graceEndsAt: null,
    secret: null,
    lastResult: null,
    ended: null,
  };
}

function setOpponentRow(rows: OpponentRow[], index: number, value: OpponentRow): OpponentRow[] {
  const next = [...rows];
  next[index] = value;
  // Never leave holes: an unseen row is shown as a blank row.
  for (let i = 0; i < next.length; i++) next[i] ??= { exact: 0, partial: 0, atMs: null };
  return next;
}

export function matchReducer(state: MatchViewState, action: MatchAction): MatchViewState {
  switch (action.type) {
    case 'reset':
      return initialMatchState();

    case 'started': {
      const { payload } = action;
      if (state.match?.matchId === payload.matchId && !payload.resume) return state;
      let board = createBoard(payload.codeLength, payload.maxAttempts);
      let opponentRows: OpponentRow[] = [];
      if (payload.resume) {
        for (const record of payload.resume.yourGuesses) {
          for (const color of record.guess) board = placePeg(board, color);
          board = commitRow(board, { exact: record.exact, partial: record.partial });
        }
        for (const row of payload.resume.opponentRows) {
          opponentRows = setOpponentRow(opponentRows, row.row, { exact: row.exact, partial: row.partial, atMs: null });
        }
      }
      return { ...initialMatchState(), match: payload, board, opponentRows };
    }

    case 'place':
      if (!canEdit(state)) return state;
      return { ...state, board: placePeg(state.board, action.color) };
    case 'remove':
      if (!canEdit(state)) return state;
      return { ...state, board: removePeg(state.board) };
    case 'clear':
      if (!canEdit(state)) return state;
      return { ...state, board: clearRow(state.board) };
    case 'toggle':
      if (!canEdit(state)) return state;
      return { ...state, board: toggleSlot(state.board, action.index) };

    case 'submitting':
      if (!canEdit(state) || !isRowComplete(state.board.current)) return state;
      return { ...state, pending: state.board.current as PegColor[] };

    case 'guessResult': {
      const { result } = action;
      if (!state.pending || result.row !== state.board.rows.length) return state;
      const board = commitRow({ ...state.board, current: state.pending }, { exact: result.exact, partial: result.partial });
      return {
        ...state,
        board,
        pending: null,
        lastResult: result,
        secret: (result.secretCode as PegColor[] | undefined) ?? state.secret,
      };
    }

    case 'guessFailed':
      return { ...state, pending: null };

    case 'opponentProgress': {
      if (state.match && action.payload.matchId !== state.match.matchId) return state;
      const { row, exact, partial, elapsedMs } = action.payload;
      return {
        ...state,
        opponentRows: setOpponentRow(state.opponentRows, row, { exact, partial, atMs: elapsedMs }),
      };
    }

    case 'opponentStatus':
      return action.status === 'connected'
        ? { ...state, opponentConnected: true, graceEndsAt: null }
        : {
            ...state,
            opponentConnected: false,
            graceEndsAt: action.graceMs != null ? (action.now ?? Date.now()) + action.graceMs : null,
          };

    case 'ended':
      if (state.match && action.payload.matchId !== state.match.matchId) return state;
      return {
        ...state,
        ended: action.payload,
        pending: null,
        secret: action.payload.secretCode ?? state.secret,
      };
  }
}

function canEdit(state: MatchViewState): boolean {
  return !!state.match && !state.ended && !state.pending && state.board.rows.length < state.board.maxAttempts;
}

export type Outcome = 'win' | 'loss' | 'draw';

export function outcomeFor(ended: MatchEndedPayload, userId: string | null | undefined): Outcome {
  if (ended.winnerId == null) return 'draw';
  return ended.winnerId === userId ? 'win' : 'loss';
}

/** Whole seconds left in a countdown to `startedAt`, or 0 when the match is live. */
export function countdownSeconds(startedAt: number, now: number): number {
  return Math.max(0, Math.ceil((startedAt - now) / 1000));
}

/** Player exhausted all attempts but the match continues because the opponent is still playing. */
export function isWaitingOnOpponent(state: MatchViewState): boolean {
  return !!state.match && !state.ended && state.board.rows.length >= state.board.maxAttempts;
}
