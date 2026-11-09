import { describe, expect, it } from 'vitest';
import {
  attemptsLeft,
  clearRow,
  colorForKey,
  commitRow,
  createBoard,
  elapsedSince,
  isRowComplete,
  placePeg,
  removePeg,
  toggleSlot,
} from './board';

describe('board state', () => {
  it('fills slots left to right', () => {
    let s = createBoard();
    s = placePeg(s, 'R');
    s = placePeg(s, 'G');
    expect(s.current).toEqual(['R', 'G', null, null]);
    expect(s.cursor).toBe(2);
  });

  it('completes a row and keeps the cursor on the last slot', () => {
    let s = createBoard();
    for (const c of ['R', 'G', 'B', 'Y'] as const) s = placePeg(s, c);
    expect(isRowComplete(s.current)).toBe(true);
    expect(s.cursor).toBe(3);
  });

  it('overwrites the cursor slot when the row is full', () => {
    let s = createBoard();
    for (const c of ['R', 'G', 'B', 'Y'] as const) s = placePeg(s, c);
    s = placePeg(s, 'P');
    expect(s.current).toEqual(['R', 'G', 'B', 'P']);
  });

  it('removes the last placed peg', () => {
    let s = createBoard();
    s = placePeg(s, 'R');
    s = placePeg(s, 'G');
    s = removePeg(s);
    expect(s.current).toEqual(['R', null, null, null]);
    expect(s.cursor).toBe(1);
    s = removePeg(s);
    s = removePeg(s);
    expect(s.current).toEqual([null, null, null, null]);
  });

  it('moves the cursor to a chosen empty slot and fills it', () => {
    let s = createBoard();
    s = toggleSlot(s, 2);
    s = placePeg(s, 'B');
    expect(s.current).toEqual([null, null, 'B', null]);
    expect(s.cursor).toBe(3);
  });

  it('empties a filled slot when clicked', () => {
    let s = createBoard();
    s = placePeg(s, 'R');
    s = placePeg(s, 'G');
    s = toggleSlot(s, 0);
    expect(s.current).toEqual([null, 'G', null, null]);
    expect(s.cursor).toBe(0);
  });

  it('commits a row and resets the active row', () => {
    let s = createBoard();
    for (const c of ['R', 'G', 'B', 'Y'] as const) s = placePeg(s, c);
    s = commitRow(s, { exact: 2, partial: 1 });
    expect(s.rows).toEqual([{ guess: ['R', 'G', 'B', 'Y'], exact: 2, partial: 1 }]);
    expect(s.current).toEqual([null, null, null, null]);
    expect(attemptsLeft(s)).toBe(9);
  });

  it('does not commit an incomplete row', () => {
    let s = createBoard();
    s = placePeg(s, 'R');
    expect(commitRow(s, { exact: 0, partial: 0 }).rows).toHaveLength(0);
  });

  it('clears the row', () => {
    let s = createBoard();
    s = placePeg(s, 'R');
    expect(clearRow(s).current).toEqual([null, null, null, null]);
  });
});

describe('helpers', () => {
  it('maps number keys to the 6 game colors', () => {
    expect(colorForKey('1')).toBe('R');
    expect(colorForKey('6')).toBe('O');
    expect(colorForKey('7')).toBeNull();
    expect(colorForKey('0')).toBeNull();
    expect(colorForKey('a')).toBeNull();
  });

  it('never returns negative elapsed time', () => {
    expect(elapsedSince(2000, 1000)).toBe(0);
    expect(elapsedSince(1000, 3500)).toBe(2500);
  });
});
