import { randomUUID } from 'node:crypto';
import { applyMatchResult, findUserById, matches } from '@mastermind/db';
import {
  CODE_LENGTH,
  GAME_PALETTE,
  MAX_ATTEMPTS,
  REDIS_KEYS,
  type GuessRecord,
  type GuessResult,
  type PegColor,
  type ScoreBreakdown,
  type SoloStartResponse,
} from '@mastermind/shared';
import type { Principal } from '../auth/tokens';
import type { DbAccess } from '../db';
import { conflict, forbidden, notFound, badRequest } from '../errors';
import { newSecret } from '../game/random';
import {
  SoloGameError,
  applySoloGuess,
  createSoloGame,
  type SoloGame,
} from '../game/solo-logic';
import { KeyedMutex } from '../lib/mutex';
import type { Logger } from '../lib/logger';
import type { Store } from '../store';
import type { LeaderboardService } from './leaderboard';

const ACTIVE_TTL_SEC = 2 * 3600;
const ENDED_TTL_SEC = 3600;

export interface SoloSubmitResult {
  submitted: boolean;
  score: ScoreBreakdown;
  rank: number | null;
}

export interface SoloSnapshot {
  gameId: string;
  codeLength: number;
  maxAttempts: number;
  palette: PegColor[];
  startedAt: number;
  guesses: GuessRecord[];
  isGameOver: boolean;
  secretCode?: PegColor[];
}

export class SoloService {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly store: Store,
    private readonly db: DbAccess,
    private readonly leaderboard: LeaderboardService,
    private readonly logger: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  private async load(gameId: string): Promise<SoloGame> {
    const raw = await this.store.get(REDIS_KEYS.game(gameId));
    if (!raw) throw notFound('Game not found or expired');
    return JSON.parse(raw) as SoloGame;
  }

  private async save(game: SoloGame): Promise<void> {
    await this.store.set(
      REDIS_KEYS.game(game.id),
      JSON.stringify(game),
      game.status === 'ENDED' ? ENDED_TTL_SEC : ACTIVE_TTL_SEC,
    );
  }

  private assertOwner(game: SoloGame, principal: Principal | null): void {
    if (game.ownerId && game.ownerId !== principal?.id) throw forbidden('This game belongs to another player');
  }

  async start(principal: Principal | null): Promise<SoloStartResponse> {
    const game = createSoloGame(
      randomUUID(),
      newSecret(),
      principal && !principal.isGuest ? principal.id : null,
      this.now(),
    );
    await this.save(game);
    return {
      gameId: game.id,
      codeLength: CODE_LENGTH,
      maxAttempts: MAX_ATTEMPTS,
      palette: [...GAME_PALETTE],
      startedAt: game.startedAt,
    };
  }

  async snapshot(gameId: string, principal: Principal | null): Promise<SoloSnapshot> {
    const game = await this.load(gameId);
    this.assertOwner(game, principal);
    return {
      gameId: game.id,
      codeLength: CODE_LENGTH,
      maxAttempts: MAX_ATTEMPTS,
      palette: [...GAME_PALETTE],
      startedAt: game.startedAt,
      guesses: game.guesses,
      isGameOver: game.status === 'ENDED',
      ...(game.status === 'ENDED' ? { secretCode: game.secret } : {}),
    };
  }

  guess(gameId: string, guess: PegColor[], principal: Principal | null): Promise<GuessResult> {
    return this.mutex.run(gameId, async () => {
      const game = await this.load(gameId);
      this.assertOwner(game, principal);
      let result: GuessResult;
      try {
        result = applySoloGuess(game, guess, this.now());
      } catch (error) {
        if (error instanceof SoloGameError) {
          throw error.code === 'GAME_OVER' ? conflict(error.message) : badRequest(error.message);
        }
        throw error;
      }
      await this.save(game);

      if (result.isGameOver && game.ownerId && principal && !principal.isGuest) {
        try {
          await this.finalize(game, game.ownerId);
        } catch (error) {
          this.logger.warn(`[solo] automatic score submission failed: ${String(error)}`);
        }
      }
      return result;
    });
  }

  /** Records a finished game on the leaderboard for a registered player. Idempotent. */
  submit(gameId: string, principal: Principal): Promise<SoloSubmitResult> {
    return this.mutex.run(gameId, async () => {
      const game = await this.load(gameId);
      if (game.ownerId && game.ownerId !== principal.id) {
        throw forbidden('This game belongs to another player');
      }
      if (game.status !== 'ENDED' || !game.score) throw conflict('Game is not finished yet');
      if (game.submitted) {
        return { submitted: false, score: game.score, rank: await this.leaderboard.rank(principal.id) };
      }
      await this.finalize(game, principal.id);
      return { submitted: true, score: game.score, rank: await this.leaderboard.rank(principal.id) };
    });
  }

  private async finalize(game: SoloGame, userId: string): Promise<void> {
    if (game.submitted || !game.score) return;
    const db = this.db.get();
    const score = game.score;
    const durationMs = game.durationMs ?? 0;

    await db.insert(matches).values({
      id: game.id,
      mode: 'SOLO',
      secretCode: game.secret,
      player1Id: userId,
      winnerId: game.won ? userId : null,
      player1Guesses: game.guesses,
      player1Score: score.total,
      durationMs,
      status: 'COMPLETED',
      createdAt: new Date(game.startedAt),
      completedAt: new Date(game.endedAt ?? this.now()),
    });

    const updated = await applyMatchResult(db, userId, {
      won: game.won,
      score: score.total,
      durationMs,
      attempts: game.guesses.length,
    });
    if (updated) {
      await this.leaderboard.record(updated, {
        score: score.total,
        won: game.won,
        durationMs,
        attempts: game.guesses.length,
      });
    } else if (!(await findUserById(db, userId))) {
      throw notFound('User not found');
    }

    game.submitted = true;
    game.ownerId = userId;
    await this.save(game);
  }
}
