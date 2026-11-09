import { randomInt } from 'node:crypto';
import { GAME_LIMITS, generateRoomCode, generateSecret, type PegColor } from '@mastermind/shared';

const RANGE = 2 ** 31;

/** Uniform [0, 1) backed by the OS CSPRNG. */
export function secureRandom(): number {
  return randomInt(0, RANGE) / RANGE;
}

export function newSecret(): PegColor[] {
  return generateSecret(secureRandom);
}

export function newRoomCode(): string {
  return generateRoomCode(secureRandom, GAME_LIMITS.ROOM_CODE_ALPHABET, GAME_LIMITS.ROOM_CODE_LENGTH);
}
