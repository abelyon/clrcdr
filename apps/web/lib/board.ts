import {
  CODE_LENGTH,
  GAME_PALETTE,
  MAX_ATTEMPTS,
  type Feedback,
  type GameColor,
  type PegColor,
} from '@mastermind/shared';

export type Slot = PegColor | null;

export interface SubmittedRow {
  guess: PegColor[];
  exact: number;
  partial: number;
}

export interface BoardState {
  codeLength: number;
  maxAttempts: number;
  rows: SubmittedRow[];
  current: Slot[];
  /** Index of the slot that receives the next peg. */
  cursor: number;
}

export function createBoard(codeLength: number = CODE_LENGTH, maxAttempts: number = MAX_ATTEMPTS): BoardState {
  return { codeLength, maxAttempts, rows: [], current: Array<Slot>(codeLength).fill(null), cursor: 0 };
}

export function isRowComplete(current: readonly Slot[]): boolean {
  return current.length > 0 && current.every((slot) => slot !== null);
}

function firstEmpty(current: readonly Slot[], from = 0): number {
  for (let i = 0; i < current.length; i++) {
    const index = (from + i) % current.length;
    if (current[index] === null) return index;
  }
  return -1;
}

/** Places a color at the cursor slot (or the next free one) and moves the cursor to the next free slot. */
export function placePeg(state: BoardState, color: PegColor): BoardState {
  const current = [...state.current];
  let target = state.cursor;
  if (current[target] !== null && firstEmpty(current, target) !== -1) {
    target = firstEmpty(current, target);
  }
  current[target] = color;
  const next = firstEmpty(current, target + 1);
  return { ...state, current, cursor: next === -1 ? target : next };
}

/** Removes the last placed peg: the slot before the cursor, or the last filled slot when the row is full. */
export function removePeg(state: BoardState): BoardState {
  const current = [...state.current];
  let target = -1;
  if (current[state.cursor] === null) {
    for (let i = state.cursor - 1; i >= 0; i--) {
      if (current[i] !== null) {
        target = i;
        break;
      }
    }
  } else {
    target = state.cursor;
  }
  if (target === -1) {
    for (let i = current.length - 1; i >= 0; i--) {
      if (current[i] !== null) {
        target = i;
        break;
      }
    }
  }
  if (target === -1) return state;
  current[target] = null;
  return { ...state, current, cursor: target };
}

/** Clicking a slot moves the cursor there; clicking a filled slot empties it. */
export function toggleSlot(state: BoardState, index: number): BoardState {
  if (index < 0 || index >= state.codeLength) return state;
  if (state.current[index] !== null) {
    const current = [...state.current];
    current[index] = null;
    return { ...state, current, cursor: index };
  }
  return { ...state, cursor: index };
}

export function clearRow(state: BoardState): BoardState {
  return { ...state, current: Array<Slot>(state.codeLength).fill(null), cursor: 0 };
}

/** Commits the current row with server feedback and prepares an empty row. */
export function commitRow(state: BoardState, feedback: Feedback): BoardState {
  if (!isRowComplete(state.current)) return state;
  const guess = state.current as PegColor[];
  return {
    ...state,
    rows: [...state.rows, { guess, exact: feedback.exact, partial: feedback.partial }],
    current: Array<Slot>(state.codeLength).fill(null),
    cursor: 0,
  };
}

export function attemptsLeft(state: BoardState): number {
  return Math.max(0, state.maxAttempts - state.rows.length);
}

/** Maps keys "1".."6" to palette colors; returns null for any other key. */
export function colorForKey(key: string, palette: readonly PegColor[] = GAME_PALETTE): GameColor | null {
  if (!/^[1-9]$/.test(key)) return null;
  const color = palette[Number(key) - 1];
  return (color as GameColor | undefined) ?? null;
}

/** Elapsed ms never goes negative, even if the clock moved backwards. */
export function elapsedSince(startedAt: number, now: number = Date.now()): number {
  return Math.max(0, now - startedAt);
}
