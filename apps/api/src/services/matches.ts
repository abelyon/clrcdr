import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { applyMatchResult, findUserById, matches as matchesTable, users, type Database } from '@mastermind/db';
import {
  GAME_LIMITS,
  GAME_PALETTE,
  CODE_LENGTH,
  MAX_ATTEMPTS,
  REDIS_KEYS,
  calculateEloChange,
  type GuessResult,
  type MatchEndReason,
  type MatchEndedPayload,
  type MatchStartedPayload,
  type OpponentInfo,
  type PegColor,
  type SocketErrorCode,
} from '@mastermind/shared';
import type { DbAccess } from '../db';
import { newSecret } from '../game/random';
import {
  MatchRuleError,
  applyMatchGuess,
  decideWinner,
  isPlayerDone,
  opponentOf,
  playerOf,
  settleMatch,
  type LiveMatch,
  type LivePlayer,
  type MatchSettlement,
} from '../game/match-logic';
import type { Logger } from '../lib/logger';
import { KeyedMutex } from '../lib/mutex';
import type { Realtime } from '../realtime';
import type { Store } from '../store';
import type { LeaderboardService } from './leaderboard';

const ACTIVE_TTL_SEC = 3600;
const ENDED_TTL_SEC = 600;

export const userMatchKey = (userId: string) => `usermatch:${userId}`;

export class MatchError extends Error {
  constructor(
    readonly code: SocketErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'MatchError';
  }
}

export interface PlayerInfo {
  userId: string;
  username: string;
  rating: number;
  isGuest: boolean;
}

export interface StartMatchInput {
  mode: LiveMatch['mode'];
  players: [PlayerInfo, PlayerInfo];
  roomCode?: string;
  tournamentId?: string;
  tournamentMatchId?: string;
}

export interface TournamentMatchOutcome {
  tournamentId: string;
  tournamentMatchId: string;
  winnerId: string;
  matchId: string;
}

export interface MatchTimings {
  countdownMs: number;
  timeoutMs: number;
  graceMs: number;
}

export const DEFAULT_TIMINGS: Omit<MatchTimings, 'countdownMs'> = {
  timeoutMs: GAME_LIMITS.MATCH_TIMEOUT_MS,
  graceMs: GAME_LIMITS.DISCONNECT_GRACE_MS,
};

interface EndOptions {
  abandoned?: boolean;
  onSettled?: (settlement: MatchSettlement) => void;
}

interface PlayerResult {
  ratingChange: number | null;
  newRating: number | null;
}

function toOpponent(p: LivePlayer): OpponentInfo {
  return { id: p.userId, username: p.username, rating: p.rating, isGuest: p.isGuest };
}

export class MatchService {
  private readonly mutex = new KeyedMutex();
  private readonly matchTimers = new Map<string, NodeJS.Timeout>();
  private readonly graceTimers = new Map<string, NodeJS.Timeout>();
  private tournamentHook: ((outcome: TournamentMatchOutcome) => Promise<void>) | null = null;

  constructor(
    private readonly store: Store,
    private readonly realtime: Realtime,
    private readonly db: DbAccess,
    private readonly leaderboard: LeaderboardService,
    private readonly logger: Logger,
    private readonly timings: MatchTimings,
    private readonly now: () => number = Date.now,
  ) {}

  setTournamentHook(hook: (outcome: TournamentMatchOutcome) => Promise<void>): void {
    this.tournamentHook = hook;
  }

  private async load(matchId: string): Promise<LiveMatch | null> {
    const raw = await this.store.get(REDIS_KEYS.match(matchId));
    return raw ? (JSON.parse(raw) as LiveMatch) : null;
  }

  private async save(match: LiveMatch): Promise<void> {
    await this.store.set(
      REDIS_KEYS.match(match.id),
      JSON.stringify(match),
      match.status === 'ENDED' ? ENDED_TTL_SEC : ACTIVE_TTL_SEC,
    );
  }

  /** Active (not ended) match the user participates in, if any. */
  async activeMatchOf(userId: string): Promise<LiveMatch | null> {
    const matchId = await this.store.get(userMatchKey(userId));
    if (!matchId) return null;
    const match = await this.load(matchId);
    if (!match || match.status !== 'ACTIVE' || !playerOf(match, userId)) {
      await this.store.del(userMatchKey(userId));
      return null;
    }
    return match;
  }

  startedPayload(match: LiveMatch, userId: string, withResume = false): MatchStartedPayload {
    const me = playerOf(match, userId) as LivePlayer;
    const opponent = opponentOf(match, userId);
    return {
      matchId: match.id,
      mode: match.mode,
      codeLength: CODE_LENGTH,
      maxAttempts: MAX_ATTEMPTS,
      palette: [...GAME_PALETTE],
      startedAt: match.startedAt,
      opponent: toOpponent(opponent),
      ...(match.roomCode ? { roomCode: match.roomCode } : {}),
      ...(match.tournamentId ? { tournamentId: match.tournamentId } : {}),
      ...(match.tournamentMatchId ? { tournamentMatchId: match.tournamentMatchId } : {}),
      ...(withResume
        ? {
            resume: {
              yourGuesses: me.guesses,
              opponentRows: opponent.guesses.map((g, row) => ({ row, exact: g.exact, partial: g.partial })),
            },
          }
        : {}),
    };
  }

  async startMatch(input: StartMatchInput): Promise<LiveMatch> {
    const [a, b] = input.players;
    for (const p of input.players) {
      if (await this.activeMatchOf(p.userId)) {
        throw new MatchError('ALREADY_IN_MATCH', `${p.username} is already in a match`);
      }
    }
    const createdAt = this.now();
    const toLive = (p: PlayerInfo): LivePlayer => ({ ...p, guesses: [], solvedAt: null });
    const match: LiveMatch = {
      id: randomUUID(),
      mode: input.mode,
      secret: newSecret(),
      createdAt,
      startedAt: createdAt + this.timings.countdownMs,
      players: [toLive(a), toLive(b)],
      status: 'ACTIVE',
      ...(input.roomCode ? { roomCode: input.roomCode } : {}),
      ...(input.tournamentId ? { tournamentId: input.tournamentId } : {}),
      ...(input.tournamentMatchId ? { tournamentMatchId: input.tournamentMatchId } : {}),
    };
    await this.save(match);
    for (const p of match.players) {
      await this.store.set(userMatchKey(p.userId), match.id, ACTIVE_TTL_SEC);
      this.realtime.setUserMatch(p.userId, match.id, match.roomCode);
    }
    this.scheduleTimeout(match);
    for (const p of match.players) {
      this.realtime.emitToUser(p.userId, 'match:started', this.startedPayload(match, p.userId));
    }
    return match;
  }

  private scheduleTimeout(match: LiveMatch): void {
    const timer = setTimeout(() => {
      void this.mutex.run(match.id, async () => {
        const current = await this.load(match.id);
        if (!current || current.status !== 'ACTIVE') return;
        await this.endLocked(current, 'timeout', decideWinner(current, current.mode === 'TOURNAMENT'));
      }).catch((error) => this.logger.error(`[match] timeout handling failed: ${String(error)}`));
    }, this.timings.countdownMs + this.timings.timeoutMs);
    timer.unref();
    this.matchTimers.set(match.id, timer);
  }

  guess(userId: string, matchId: string, guess: PegColor[]): Promise<GuessResult> {
    return this.mutex.run(matchId, async () => {
      const match = await this.load(matchId);
      if (!match) throw new MatchError('NOT_FOUND', 'Match not found');
      const now = this.now();
      let applied;
      try {
        applied = applyMatchGuess(match, userId, guess, now);
      } catch (error) {
        if (error instanceof MatchRuleError) throw new MatchError(error.code, error.message);
        throw error;
      }
      const me = playerOf(match, userId) as LivePlayer;
      const opponent = opponentOf(match, userId);
      await this.save(match);

      this.realtime.emitToUser(opponent.userId, 'match:opponent_progress', {
        matchId,
        row: applied.row,
        exact: applied.exact,
        partial: applied.partial,
        attemptsUsed: me.guesses.length,
        elapsedMs: Math.max(0, now - match.startedAt),
      });

      const result: GuessResult = {
        exact: applied.exact,
        partial: applied.partial,
        row: applied.row,
        isWin: applied.solved,
        isGameOver: false,
      };

      const bothDone = isPlayerDone(me) && isPlayerDone(opponent);
      if (applied.solved || bothDone) {
        await this.endLocked(
          match,
          applied.solved ? 'solved' : 'exhausted',
          applied.solved ? userId : decideWinner(match, match.mode === 'TOURNAMENT'),
          {
            onSettled: (settlement) => {
              const mine = settlement.scores[userId];
              result.isGameOver = true;
              result.attemptsUsed = me.guesses.length;
              result.durationMs = mine?.durationMs ?? settlement.durationMs;
              if (mine) result.score = mine.score;
              result.secretCode = [...match.secret];
              this.realtime.emitToUser(userId, 'match:guess_result', { matchId, result });
            },
          },
        );
      } else {
        this.realtime.emitToUser(userId, 'match:guess_result', { matchId, result });
      }
      return result;
    });
  }

  forfeit(userId: string, matchId: string): Promise<void> {
    return this.mutex.run(matchId, async () => {
      const match = await this.load(matchId);
      if (!match) throw new MatchError('NOT_FOUND', 'Match not found');
      if (!playerOf(match, userId)) throw new MatchError('NOT_YOUR_MATCH', 'You are not part of this match');
      if (match.status !== 'ACTIVE') throw new MatchError('MATCH_OVER', 'Match is over');
      await this.endLocked(match, 'forfeit', opponentOf(match, userId).userId);
    });
  }

  async rejoin(userId: string, matchId: string): Promise<MatchStartedPayload> {
    const match = await this.load(matchId);
    if (!match) throw new MatchError('NOT_FOUND', 'Match not found');
    if (!playerOf(match, userId)) throw new MatchError('NOT_YOUR_MATCH', 'You are not part of this match');
    if (match.status !== 'ACTIVE') throw new MatchError('MATCH_OVER', 'Match is over');
    this.markReconnected(match, userId);
    return this.startedPayload(match, userId, true);
  }

  /** A socket of the user connected: cancel forfeit timers and replay the active match state. */
  async onUserConnected(userId: string): Promise<void> {
    const match = await this.activeMatchOf(userId);
    if (!match) return;
    this.realtime.setUserMatch(userId, match.id, match.roomCode);
    this.markReconnected(match, userId);
    this.realtime.emitToUser(userId, 'match:started', this.startedPayload(match, userId, true));
  }

  private markReconnected(match: LiveMatch, userId: string): void {
    const key = `${match.id}:${userId}`;
    const timer = this.graceTimers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.graceTimers.delete(key);
    }
    this.realtime.emitToUser(opponentOf(match, userId).userId, 'match:opponent_status', {
      matchId: match.id,
      status: 'connected',
    });
  }

  /** The user's last socket went away: start the forfeit grace period for an active match. */
  async onUserDisconnected(userId: string): Promise<void> {
    const match = await this.activeMatchOf(userId);
    if (!match) return;
    const key = `${match.id}:${userId}`;
    if (this.graceTimers.has(key)) return;

    this.realtime.emitToUser(opponentOf(match, userId).userId, 'match:opponent_status', {
      matchId: match.id,
      status: 'disconnected',
      graceMs: this.timings.graceMs,
    });

    const timer = setTimeout(() => {
      this.graceTimers.delete(key);
      void this.mutex.run(match.id, async () => {
        const current = await this.load(match.id);
        if (!current || current.status !== 'ACTIVE') return;
        if (await this.realtime.isUserOnline(userId)) return;
        const opponent = opponentOf(current, userId);
        const opponentOnline = await this.realtime.isUserOnline(opponent.userId);
        const winnerId = opponentOnline
          ? opponent.userId
          : decideWinner(current, current.mode === 'TOURNAMENT');
        await this.endLocked(current, 'disconnect', winnerId, { abandoned: true });
      }).catch((error) => this.logger.error(`[match] disconnect handling failed: ${String(error)}`));
    }, this.timings.graceMs);
    timer.unref();
    this.graceTimers.set(key, timer);
  }

  private clearTimers(match: LiveMatch): void {
    const timer = this.matchTimers.get(match.id);
    if (timer) clearTimeout(timer);
    this.matchTimers.delete(match.id);
    for (const p of match.players) {
      const key = `${match.id}:${p.userId}`;
      const grace = this.graceTimers.get(key);
      if (grace) clearTimeout(grace);
      this.graceTimers.delete(key);
    }
  }

  /** Must be called while holding the match lock. */
  private async endLocked(
    match: LiveMatch,
    reason: MatchEndReason,
    winnerId: string | null,
    options: EndOptions = {},
  ): Promise<MatchSettlement> {
    const abandoned = options.abandoned ?? false;
    const onSettled = options.onSettled;

    const now = this.now();
    match.status = 'ENDED';
    match.endedAt = now;
    const settlement = settleMatch(match, winnerId, reason, now);
    this.clearTimers(match);
    await this.save(match);
    for (const p of match.players) {
      await this.store.del(userMatchKey(p.userId));
      this.realtime.setUserMatch(p.userId, undefined, undefined);
    }

    const results = await this.persist(match, settlement, abandoned);
    onSettled?.(settlement);

    for (const p of match.players) {
      const mine = settlement.scores[p.userId];
      const theirs = settlement.scores[opponentOf(match, p.userId).userId];
      const rating = results.get(p.userId);
      const payload: MatchEndedPayload = {
        matchId: match.id,
        winnerId,
        reason,
        secretCode: [...match.secret],
        yourScore: (mine as NonNullable<typeof mine>).score,
        opponentScore: (theirs as NonNullable<typeof theirs>).score,
        durationMs: settlement.durationMs,
        ratingChange: rating?.ratingChange ?? null,
        newRating: rating?.newRating ?? null,
        ...(match.tournamentId ? { tournamentId: match.tournamentId } : {}),
      };
      this.realtime.emitToUser(p.userId, 'match:ended', payload);
    }

    if (match.mode === 'TOURNAMENT' && match.tournamentId && match.tournamentMatchId && winnerId && this.tournamentHook) {
      try {
        await this.tournamentHook({
          tournamentId: match.tournamentId,
          tournamentMatchId: match.tournamentMatchId,
          winnerId,
          matchId: match.id,
        });
      } catch (error) {
        this.logger.error(`[match] tournament advance failed: ${String(error)}`);
      }
    }
    return settlement;
  }

  /** Writes the match row, user stats, Elo and leaderboard entries. Never throws. */
  private async persist(
    match: LiveMatch,
    settlement: MatchSettlement,
    abandoned: boolean,
  ): Promise<Map<string, PlayerResult>> {
    const results = new Map<string, PlayerResult>();
    const db = this.db.tryGet();
    const [p1, p2] = match.players;
    if (!db || (p1.isGuest && p2.isGuest)) return results;

    try {
      const { winnerId } = settlement;
      await db.insert(matchesTable).values({
        id: match.id,
        mode: match.mode,
        secretCode: match.secret,
        player1Id: p1.isGuest ? null : p1.userId,
        player2Id: p2.isGuest ? null : p2.userId,
        winnerId: winnerId && !match.players.find((p) => p.userId === winnerId)?.isGuest ? winnerId : null,
        player1Guesses: p1.guesses,
        player2Guesses: p2.guesses,
        player1Score: settlement.scores[p1.userId]?.score.total ?? 0,
        player2Score: settlement.scores[p2.userId]?.score.total ?? 0,
        durationMs: settlement.durationMs,
        status: abandoned ? 'ABANDONED' : 'COMPLETED',
        createdAt: new Date(match.createdAt),
        completedAt: new Date(match.endedAt ?? this.now()),
      });

      const skipStats = settlement.reason === 'disconnect' && winnerId === null;
      if (skipStats) return results;

      let deltas: Map<string, number> | null = null;
      if (match.mode === '1V1' && !p1.isGuest && !p2.isGuest) {
        const [f1, f2] = await Promise.all([findUserById(db, p1.userId), findUserById(db, p2.userId)]);
        if (f1 && f2) {
          const outcome = winnerId === p1.userId ? 1 : winnerId === p2.userId ? 0 : 0.5;
          const elo = calculateEloChange(f1.rating, f2.rating, outcome);
          deltas = new Map([
            [p1.userId, elo.deltaA],
            [p2.userId, elo.deltaB],
          ]);
        }
      }

      for (const p of match.players) {
        if (p.isGuest) continue;
        const outcome = settlement.scores[p.userId];
        if (!outcome) continue;
        const won = winnerId === p.userId;
        const solved = p.solvedAt !== null;
        const delta = deltas?.get(p.userId);
        const updated = await this.applyResult(db, p, {
          won,
          solved,
          score: outcome.score.total,
          durationMs: outcome.durationMs,
          attempts: p.guesses.length,
          ...(delta === undefined ? {} : { ratingDelta: delta }),
        });
        if (!updated) continue;
        await this.leaderboard.record(updated, {
          score: outcome.score.total,
          won,
          solved,
          durationMs: outcome.durationMs,
          attempts: p.guesses.length,
        });
        results.set(p.userId, {
          ratingChange: delta === undefined ? null : delta,
          newRating: updated.rating,
        });
      }
    } catch (error) {
      this.logger.error(`[match] persisting ${match.id} failed: ${String(error)}`);
    }
    return results;
  }

  /**
   * Updates lifetime stats. A win without cracking the code (opponent left, tie-break) counts as a win
   * but must not set a best time, so it is applied as a loss plus an explicit win increment.
   */
  private async applyResult(
    db: Database,
    player: LivePlayer,
    r: {
      won: boolean;
      solved: boolean;
      score: number;
      durationMs: number;
      attempts: number;
      ratingDelta?: number;
    },
  ) {
    if (!r.won || r.solved) {
      return applyMatchResult(db, player.userId, {
        won: r.won,
        score: r.score,
        durationMs: r.durationMs,
        attempts: r.attempts,
        ...(r.ratingDelta === undefined ? {} : { ratingDelta: r.ratingDelta }),
      });
    }
    await applyMatchResult(db, player.userId, {
      won: false,
      score: r.score,
      durationMs: r.durationMs,
      attempts: r.attempts,
      ...(r.ratingDelta === undefined ? {} : { ratingDelta: r.ratingDelta }),
    });
    const [updated] = await db
      .update(users)
      .set({
        gamesWon: sql`${users.gamesWon} + 1`,
        totalWinAttempts: sql`${users.totalWinAttempts} + ${r.attempts}`,
      })
      .where(sql`${users.id} = ${player.userId}`)
      .returning();
    return updated ?? null;
  }

  shutdown(): void {
    for (const t of this.matchTimers.values()) clearTimeout(t);
    for (const t of this.graceTimers.values()) clearTimeout(t);
    this.matchTimers.clear();
    this.graceTimers.clear();
  }
}
