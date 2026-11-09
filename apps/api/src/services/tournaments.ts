import { and, asc, eq, ilike, inArray, or } from 'drizzle-orm';
import {
  TournamentError,
  addParticipants,
  completeTournamentMatch,
  createBotUsers,
  findUserById,
  getTournamentDetail,
  listTournaments,
  removeParticipant,
  resetTournament,
  startTournament,
  tournamentMatches,
  tournaments,
  users,
} from '@mastermind/db';
import type {
  BracketMatch,
  CreateTournamentInput,
  PlayerRef,
  TournamentDetail,
  TournamentMatchJoinPayload,
  TournamentSummary,
  MatchStartedPayload,
} from '@mastermind/shared';
import type { Principal } from '../auth/tokens';
import type { DbAccess } from '../db';
import { ApiError, conflict, forbidden, isUuid, notFound } from '../errors';
import type { Logger } from '../lib/logger';
import { KeyedMutex } from '../lib/mutex';
import type { Realtime } from '../realtime';
import type { Store } from '../store';
import { MatchError, type MatchService, type PlayerInfo, type TournamentMatchOutcome } from './matches';

const WAITING_TTL_SEC = 30 * 60;
const waitingKey = (tournamentMatchId: string) => `tmatch:${tournamentMatchId}`;

export function mapTournamentError(error: unknown): unknown {
  if (error instanceof TournamentError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return notFound(error.message);
      default:
        return conflict(error.message);
    }
  }
  return error;
}

/** Picks the winner of a bracket match that involves a bot: the human advances; bot vs bot is decided by rating. */
export function resolveBotMatch(match: BracketMatch): string | null {
  const { player1, player2 } = match;
  if (!player1 || !player2) return null;
  if (player1.isBot && player2.isBot) {
    return player2.rating > player1.rating ? player2.id : player1.id;
  }
  if (player1.isBot) return player2.id;
  if (player2.isBot) return player1.id;
  return null;
}

export type JoinMatchResult = { kind: 'waiting' } | { kind: 'started'; payload: MatchStartedPayload };

export class TournamentService {
  private readonly mutex = new KeyedMutex();

  constructor(
    private readonly store: Store,
    private readonly db: DbAccess,
    private readonly realtime: Realtime,
    private readonly matches: MatchService,
    private readonly logger: Logger,
  ) {
    this.matches.setTournamentHook((outcome) => this.onMatchEnded(outcome));
  }

  async list(viewerId?: string): Promise<TournamentSummary[]> {
    return listTournaments(this.db.get(), viewerId);
  }

  async detail(id: string, viewerId?: string): Promise<TournamentDetail> {
    if (!isUuid(id)) throw notFound('Tournament not found');
    const detail = await getTournamentDetail(this.db.get(), id, viewerId);
    if (!detail) throw notFound('Tournament not found');
    return detail;
  }

  async create(input: CreateTournamentInput, creator: Principal): Promise<TournamentDetail> {
    const db = this.db.get();
    const [row] = await db
      .insert(tournaments)
      .values({
        name: input.name,
        description: input.description ?? null,
        maxPlayers: input.maxPlayers,
        createdById: creator.isGuest ? null : creator.id,
        startTime: input.startTime ? new Date(input.startTime) : null,
      })
      .returning();
    if (!row) throw new ApiError('INTERNAL', 'Could not create tournament');
    return this.detail(row.id, creator.id);
  }

  async join(id: string, user: Principal): Promise<TournamentDetail> {
    if (user.isGuest) throw forbidden('Guests cannot join tournaments');
    if (!isUuid(id)) throw notFound('Tournament not found');
    const db = this.db.get();
    const result = await addParticipants(db, id, [user.id]).catch((e) => {
      throw mapTournamentError(e);
    });
    if (result.added === 0) throw conflict('You already joined this tournament');
    return this.broadcast(id, user.id);
  }

  async leave(id: string, user: Principal): Promise<TournamentDetail> {
    if (user.isGuest) throw forbidden('Guests cannot join tournaments');
    const db = this.db.get();
    const current = await this.detail(id);
    if (current.status !== 'REGISTRATION') throw conflict('Registration is closed');
    await removeParticipant(db, id, user.id);
    return this.broadcast(id, user.id);
  }

  async addPlayers(id: string, input: { userIds?: string[] | undefined; botCount?: number | undefined }, viewerId: string) {
    const db = this.db.get();
    await this.detail(id);
    const ids = [...(input.userIds ?? [])];
    if (input.userIds && input.userIds.length > 0) {
      const found = await db.select({ id: users.id }).from(users).where(inArray(users.id, input.userIds));
      if (found.length !== new Set(input.userIds).size) throw notFound('One or more users do not exist');
    }
    const current = await this.detail(id);
    if (current.status !== 'REGISTRATION') throw conflict('Registration is closed');
    const slotsLeft = current.maxPlayers - current.participantCount;
    const freshUsers = ids.filter((uid) => !current.participants.some((p) => p.id === uid)).length;
    const botCount = Math.min(input.botCount ?? 0, Math.max(0, slotsLeft - freshUsers));
    if (botCount > 0) ids.push(...(await createBotUsers(db, botCount)));
    if (ids.length > 0) {
      await addParticipants(db, id, ids).catch((e) => {
        throw mapTournamentError(e);
      });
    }
    return this.broadcast(id, viewerId);
  }

  async removePlayer(id: string, userId: string, viewerId: string): Promise<TournamentDetail> {
    if (!isUuid(userId)) throw notFound('Player not found');
    const current = await this.detail(id);
    if (current.status !== 'REGISTRATION') throw conflict('Registration is closed');
    await removeParticipant(this.db.get(), id, userId);
    return this.broadcast(id, viewerId);
  }

  async start(id: string, viewerId: string): Promise<TournamentDetail> {
    if (!isUuid(id)) throw notFound('Tournament not found');
    const db = this.db.get();
    await startTournament(db, id).catch((e) => {
      throw mapTournamentError(e);
    });
    await this.autoResolveBots(id);
    const detail = await this.broadcast(id, viewerId);
    for (const m of detail.matches) {
      if (m.status === 'READY') this.announceReady(detail, m);
    }
    return detail;
  }

  async reset(id: string, viewerId: string): Promise<TournamentDetail> {
    const before = await this.detail(id);
    for (const m of before.matches) await this.store.del(waitingKey(m.id));
    await resetTournament(this.db.get(), id).catch((e) => {
      throw mapTournamentError(e);
    });
    return this.broadcast(id, viewerId);
  }

  /** Admin override that decides a bracket match (for example when a player never shows up). */
  async walkover(id: string, tournamentMatchId: string, winnerId: string, viewerId: string): Promise<TournamentDetail> {
    const db = this.db.get();
    if (!isUuid(tournamentMatchId)) throw notFound('Bracket match not found');
    await this.detail(id);
    const [row] = await db
      .select()
      .from(tournamentMatches)
      .where(and(eq(tournamentMatches.id, tournamentMatchId), eq(tournamentMatches.tournamentId, id)))
      .limit(1);
    if (!row) throw notFound('Bracket match not found');
    await this.mutex.run(`tm:${tournamentMatchId}`, async () => {
      await completeTournamentMatch(db, { tournamentMatchId, winnerId }).catch((e) => {
        throw mapTournamentError(e);
      });
      await this.store.del(waitingKey(tournamentMatchId));
    });
    await this.autoResolveBots(id);
    const detail = await this.broadcast(id, viewerId);
    this.announceNextReady(detail);
    return detail;
  }

  async searchUsers(query: string | undefined, limit: number) {
    const db = this.db.get();
    const q = query?.trim();
    const where = q ? or(ilike(users.username, `%${q}%`), ilike(users.email, `%${q}%`)) : undefined;
    const rows = await db
      .select({ id: users.id, username: users.username, rating: users.rating, isBot: users.isBot })
      .from(users)
      .where(where)
      .orderBy(asc(users.username))
      .limit(limit);
    return rows;
  }

  /** Fetches the bracket and pushes `tournament:bracket_updated` to everyone subscribed. */
  async broadcast(id: string, viewerId?: string): Promise<TournamentDetail> {
    const detail = await this.detail(id, viewerId);
    this.realtime.emitToTournament(id, 'tournament:bracket_updated', {
      tournamentId: id,
      status: detail.status,
      matches: detail.matches,
      winnerId: detail.winner?.id ?? null,
    });
    return detail;
  }

  /** Bots never play: resolve every READY match that involves one until none remain. */
  async autoResolveBots(id: string): Promise<void> {
    const db = this.db.get();
    for (let guard = 0; guard < 256; guard++) {
      const detail = await this.detail(id);
      const next = detail.matches.find((m) => m.status === 'READY' && resolveBotMatch(m) !== null);
      if (!next) return;
      await completeTournamentMatch(db, {
        tournamentMatchId: next.id,
        winnerId: resolveBotMatch(next) as string,
      }).catch((e) => {
        throw mapTournamentError(e);
      });
    }
  }

  private announceReady(detail: TournamentDetail, match: BracketMatch): void {
    const { player1, player2 } = match;
    if (!player1 || !player2 || player1.isBot || player2.isBot) return;
    const pairs: [PlayerRef, PlayerRef][] = [
      [player1, player2],
      [player2, player1],
    ];
    for (const [me, opp] of pairs) {
      this.realtime.emitToUser(me.id, 'tournament:match:ready', {
        tournamentId: detail.id,
        tournamentMatchId: match.id,
        round: match.round,
        opponent: { id: opp.id, username: opp.username, rating: opp.rating, isGuest: false },
      });
    }
  }

  private announceNextReady(detail: TournamentDetail): void {
    for (const m of detail.matches) {
      if (m.status === 'READY') this.announceReady(detail, m);
    }
  }

  /** Called when a live tournament match ends: advance the winner and broadcast the bracket. */
  async onMatchEnded(outcome: TournamentMatchOutcome): Promise<void> {
    const db = this.db.get();
    const before = await this.detail(outcome.tournamentId);
    await this.mutex.run(`tm:${outcome.tournamentMatchId}`, async () => {
      try {
        await completeTournamentMatch(db, {
          tournamentMatchId: outcome.tournamentMatchId,
          winnerId: outcome.winnerId,
          matchId: outcome.matchId,
        });
      } catch (error) {
        if (!(error instanceof TournamentError && error.code === 'INVALID_STATE')) throw error;
        this.logger.warn(`[tournament] ${outcome.tournamentMatchId} already decided`);
      }
      await this.store.del(waitingKey(outcome.tournamentMatchId));
    });
    await this.autoResolveBots(outcome.tournamentId);
    const detail = await this.broadcast(outcome.tournamentId);
    const beforeReady = new Set(before.matches.filter((m) => m.status === 'READY').map((m) => m.id));
    for (const m of detail.matches) {
      if (m.status === 'READY' && !beforeReady.has(m.id)) this.announceReady(detail, m);
    }
  }

  /** A bracket player asks to start their match; the live match begins once both players have joined. */
  async joinMatch(player: PlayerInfo, payload: TournamentMatchJoinPayload): Promise<JoinMatchResult> {
    if (player.isGuest) throw new MatchError('FORBIDDEN', 'Guests cannot play tournament matches');
    const db = this.db.tryGet();
    if (!db) throw new MatchError('INTERNAL', 'Database is not available');

    return this.mutex.run(`tm:${payload.tournamentMatchId}`, async () => {
      if (!isUuid(payload.tournamentMatchId) || !isUuid(payload.tournamentId)) {
        throw new MatchError('NOT_FOUND', 'Bracket match not found');
      }
      const [row] = await db
        .select()
        .from(tournamentMatches)
        .where(
          and(
            eq(tournamentMatches.id, payload.tournamentMatchId),
            eq(tournamentMatches.tournamentId, payload.tournamentId),
          ),
        )
        .limit(1);
      if (!row) throw new MatchError('NOT_FOUND', 'Bracket match not found');
      if (row.player1Id !== player.userId && row.player2Id !== player.userId) {
        throw new MatchError('NOT_YOUR_MATCH', 'You are not a player of this bracket match');
      }
      if (row.status === 'COMPLETED' || row.status === 'BYE') {
        throw new MatchError('MATCH_OVER', 'This bracket match is already decided');
      }
      if (row.status === 'PENDING' || !row.player1Id || !row.player2Id) {
        throw new MatchError('MATCH_NOT_READY', 'Waiting for the previous round to finish');
      }

      const active = await this.matches.activeMatchOf(player.userId);
      if (active) {
        if (active.tournamentMatchId === row.id) {
          return { kind: 'started', payload: this.matches.startedPayload(active, player.userId, true) } as const;
        }
        throw new MatchError('ALREADY_IN_MATCH', 'You are already in a match');
      }

      const opponentId = row.player1Id === player.userId ? row.player2Id : row.player1Id;
      const raw = await this.store.get(waitingKey(row.id));
      const waiting = raw ? (JSON.parse(raw) as { userId: string }) : null;

      if (!waiting || waiting.userId === player.userId || !(await this.realtime.isUserOnline(waiting.userId))) {
        await this.store.set(waitingKey(row.id), JSON.stringify({ userId: player.userId }), WAITING_TTL_SEC);
        this.realtime.emitToUser(opponentId, 'tournament:match:ready', {
          tournamentId: payload.tournamentId,
          tournamentMatchId: row.id,
          round: row.round,
          opponent: {
            id: player.userId,
            username: player.username,
            rating: player.rating,
            isGuest: false,
          },
        });
        return { kind: 'waiting' } as const;
      }

      const [first, second] = await Promise.all([
        findUserById(db, row.player1Id),
        findUserById(db, row.player2Id),
      ]);
      if (!first || !second) throw new MatchError('NOT_FOUND', 'Bracket player not found');
      const toInfo = (u: typeof first): PlayerInfo => ({
        userId: u.id,
        username: u.username,
        rating: u.rating,
        isGuest: false,
      });

      const match = await this.matches.startMatch({
        mode: 'TOURNAMENT',
        players: [toInfo(first), toInfo(second)],
        tournamentId: payload.tournamentId,
        tournamentMatchId: row.id,
      });
      await db
        .update(tournamentMatches)
        .set({ status: 'IN_PROGRESS' })
        .where(eq(tournamentMatches.id, row.id));
      await this.store.del(waitingKey(row.id));
      await this.broadcast(payload.tournamentId).catch((e) =>
        this.logger.warn(`[tournament] broadcast failed: ${String(e)}`),
      );
      return { kind: 'started', payload: this.matches.startedPayload(match, player.userId) } as const;
    });
  }
}
