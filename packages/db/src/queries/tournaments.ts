import { randomBytes, randomUUID } from 'node:crypto';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
import {
  buildBracketPlan,
  type BracketMatch,
  type BracketPlan,
  type PlayerRef,
  type TournamentDetail,
  type TournamentSummary,
} from '@mastermind/shared';
import type { Database } from '../client';
import {
  tournamentMatches,
  tournamentParticipants,
  tournaments,
  users,
  type TournamentMatchRow,
  type TournamentRow,
} from '../schema';
import { createUser, type DbLike } from './users';

export type TournamentErrorCode =
  | 'NOT_FOUND'
  | 'INVALID_STATE'
  | 'NOT_ENOUGH_PLAYERS'
  | 'FULL'
  | 'ALREADY_JOINED';

export class TournamentError extends Error {
  constructor(
    public readonly code: TournamentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'TournamentError';
  }
}

function toSummary(row: TournamentRow, participantCount: number, isJoined?: boolean): TournamentSummary {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    maxPlayers: row.maxPlayers,
    participantCount,
    createdById: row.createdById,
    startTime: row.startTime ? row.startTime.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
    ...(isJoined === undefined ? {} : { isJoined }),
  };
}

export async function listTournaments(
  db: DbLike,
  viewerId?: string,
): Promise<TournamentSummary[]> {
  const rows = await db.select().from(tournaments).orderBy(desc(tournaments.createdAt));
  if (rows.length === 0) return [];

  const participants = await db
    .select({
      tournamentId: tournamentParticipants.tournamentId,
      userId: tournamentParticipants.userId,
    })
    .from(tournamentParticipants)
    .where(
      inArray(
        tournamentParticipants.tournamentId,
        rows.map((r) => r.id),
      ),
    );

  const counts = new Map<string, number>();
  const joined = new Set<string>();
  for (const p of participants) {
    counts.set(p.tournamentId, (counts.get(p.tournamentId) ?? 0) + 1);
    if (viewerId && p.userId === viewerId) joined.add(p.tournamentId);
  }

  const order = { IN_PROGRESS: 0, REGISTRATION: 1, COMPLETED: 2 } as const;
  return rows
    .map((row) => toSummary(row, counts.get(row.id) ?? 0, viewerId ? joined.has(row.id) : undefined))
    .sort((a, b) => order[a.status] - order[b.status]);
}

export async function getTournamentDetail(
  db: DbLike,
  tournamentId: string,
  viewerId?: string,
): Promise<TournamentDetail | null> {
  const [row] = await db.select().from(tournaments).where(eq(tournaments.id, tournamentId)).limit(1);
  if (!row) return null;

  const participantRows = await db
    .select({
      id: users.id,
      username: users.username,
      rating: users.rating,
      isBot: users.isBot,
      seed: tournamentParticipants.seed,
    })
    .from(tournamentParticipants)
    .innerJoin(users, eq(users.id, tournamentParticipants.userId))
    .where(eq(tournamentParticipants.tournamentId, tournamentId))
    .orderBy(asc(tournamentParticipants.seed), desc(users.rating), asc(users.username));

  const participants: PlayerRef[] = participantRows.map((p) => ({
    id: p.id,
    username: p.username,
    rating: p.rating,
    seed: p.seed,
    isBot: p.isBot,
  }));
  const byId = new Map(participants.map((p) => [p.id, p]));

  const matchRows = await db
    .select()
    .from(tournamentMatches)
    .where(eq(tournamentMatches.tournamentId, tournamentId))
    .orderBy(asc(tournamentMatches.round), asc(tournamentMatches.matchOrder));

  const matches: BracketMatch[] = matchRows.map((m) => toBracketMatch(m, byId));
  const totalRounds = matches.reduce((max, m) => Math.max(max, m.round), 0);
  const final = matches.find((m) => m.round === totalRounds);
  const winner =
    row.status === 'COMPLETED' && final?.winnerId ? (byId.get(final.winnerId) ?? null) : null;

  return {
    ...toSummary(
      row,
      participants.length,
      viewerId ? participants.some((p) => p.id === viewerId) : undefined,
    ),
    totalRounds,
    participants,
    matches,
    winner,
  };
}

function toBracketMatch(m: TournamentMatchRow, byId: Map<string, PlayerRef>): BracketMatch {
  return {
    id: m.id,
    tournamentId: m.tournamentId,
    round: m.round,
    matchOrder: m.matchOrder,
    player1: m.player1Id ? (byId.get(m.player1Id) ?? null) : null,
    player2: m.player2Id ? (byId.get(m.player2Id) ?? null) : null,
    winnerId: m.winnerId,
    matchId: m.matchId,
    nextMatchId: m.nextMatchId,
    nextMatchSlot: m.nextMatchSlot,
    status: m.status,
  };
}

export async function addParticipants(
  db: Database,
  tournamentId: string,
  userIds: string[],
): Promise<{ added: number }> {
  return db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for('update');
    if (!t) throw new TournamentError('NOT_FOUND', 'Tournament not found');
    if (t.status !== 'REGISTRATION') {
      throw new TournamentError('INVALID_STATE', 'Registration is closed');
    }

    const existing = await tx
      .select({ userId: tournamentParticipants.userId })
      .from(tournamentParticipants)
      .where(eq(tournamentParticipants.tournamentId, tournamentId));
    const have = new Set(existing.map((e) => e.userId));
    const fresh = [...new Set(userIds)].filter((id) => !have.has(id));
    if (fresh.length === 0) return { added: 0 };
    if (have.size + fresh.length > t.maxPlayers) {
      throw new TournamentError('FULL', 'Tournament is full');
    }

    await tx
      .insert(tournamentParticipants)
      .values(fresh.map((userId) => ({ tournamentId, userId })))
      .onConflictDoNothing();
    return { added: fresh.length };
  });
}

export async function removeParticipant(
  db: Database,
  tournamentId: string,
  userId: string,
): Promise<void> {
  await db
    .delete(tournamentParticipants)
    .where(
      and(
        eq(tournamentParticipants.tournamentId, tournamentId),
        eq(tournamentParticipants.userId, userId),
      ),
    );
}

/** Creates bot users (flagged `isBot`, no usable password) that can be seeded into a bracket. */
export async function createBotUsers(db: Database, count: number): Promise<string[]> {
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const tag = randomBytes(3).toString('hex');
    const bot = await createUser(db, {
      username: `Bot-${tag}`,
      email: `bot-${tag}-${randomUUID().slice(0, 8)}@bots.clrcdr.gg`,
      passwordHash: `!${randomBytes(24).toString('hex')}`,
      rating: 800 + Math.floor(Math.random() * 400),
      isBot: true,
    });
    ids.push(bot.id);
  }
  return ids;
}

export interface BracketRows {
  rows: (typeof tournamentMatches.$inferInsert)[];
  idByPosition: Map<string, string>;
}

/** Maps a bracket plan to insertable rows with generated UUIDs and next-match links. */
export function createBracketRows(tournamentId: string, plan: BracketPlan): BracketRows {
  const idByPosition = new Map<string, string>();
  for (const m of plan.matches) idByPosition.set(`${m.round}:${m.matchOrder}`, randomUUID());

  const rows = plan.matches.map((m) => ({
    id: idByPosition.get(`${m.round}:${m.matchOrder}`) as string,
    tournamentId,
    round: m.round,
    matchOrder: m.matchOrder,
    player1Id: m.player1Id,
    player2Id: m.player2Id,
    winnerId: m.winnerId,
    nextMatchId:
      m.nextRound === null ? null : (idByPosition.get(`${m.nextRound}:${m.nextMatchOrder}`) ?? null),
    nextMatchSlot: m.nextMatchSlot,
    status: m.status,
  }));
  return { rows, idByPosition };
}

export async function persistBracket(
  db: DbLike,
  tournamentId: string,
  plan: BracketPlan,
): Promise<TournamentMatchRow[]> {
  const { rows } = createBracketRows(tournamentId, plan);
  return db.insert(tournamentMatches).values(rows).returning();
}

/**
 * Closes registration: seeds participants by rating (highest first), builds the single-elimination
 * bracket padded to the next power of two and auto-advances BYEs.
 */
export async function startTournament(
  db: Database,
  tournamentId: string,
): Promise<TournamentDetail> {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for('update');
    if (!t) throw new TournamentError('NOT_FOUND', 'Tournament not found');
    if (t.status !== 'REGISTRATION') {
      throw new TournamentError('INVALID_STATE', 'Tournament has already started');
    }

    const participants = await tx
      .select({ userId: tournamentParticipants.userId })
      .from(tournamentParticipants)
      .innerJoin(users, eq(users.id, tournamentParticipants.userId))
      .where(eq(tournamentParticipants.tournamentId, tournamentId))
      .orderBy(desc(users.rating), asc(users.username));

    if (participants.length < 2) {
      throw new TournamentError('NOT_ENOUGH_PLAYERS', 'At least 2 participants are required');
    }

    const orderedIds = participants.map((p) => p.userId);
    for (let i = 0; i < orderedIds.length; i++) {
      await tx
        .update(tournamentParticipants)
        .set({ seed: i + 1 })
        .where(
          and(
            eq(tournamentParticipants.tournamentId, tournamentId),
            eq(tournamentParticipants.userId, orderedIds[i] as string),
          ),
        );
    }

    await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
    await persistBracket(tx, tournamentId, buildBracketPlan(orderedIds));
    await tx
      .update(tournaments)
      .set({ status: 'IN_PROGRESS', startTime: sql`COALESCE(${tournaments.startTime}, now())` })
      .where(eq(tournaments.id, tournamentId));
  });

  const detail = await getTournamentDetail(db, tournamentId);
  if (!detail) throw new TournamentError('NOT_FOUND', 'Tournament not found');
  return detail;
}

/** Deletes the bracket, clears seeds and returns the tournament to REGISTRATION. */
export async function resetTournament(db: Database, tournamentId: string): Promise<TournamentDetail> {
  await db.transaction(async (tx) => {
    const [t] = await tx.select().from(tournaments).where(eq(tournaments.id, tournamentId)).for('update');
    if (!t) throw new TournamentError('NOT_FOUND', 'Tournament not found');
    await tx.delete(tournamentMatches).where(eq(tournamentMatches.tournamentId, tournamentId));
    await tx
      .update(tournamentParticipants)
      .set({ seed: null })
      .where(eq(tournamentParticipants.tournamentId, tournamentId));
    await tx.update(tournaments).set({ status: 'REGISTRATION' }).where(eq(tournaments.id, tournamentId));
  });
  const detail = await getTournamentDetail(db, tournamentId);
  if (!detail) throw new TournamentError('NOT_FOUND', 'Tournament not found');
  return detail;
}

export interface CompleteTournamentMatchInput {
  tournamentMatchId: string;
  winnerId: string;
  /** The finished row in `matches`, when one exists. */
  matchId?: string | null;
}

export interface CompleteTournamentMatchResult {
  tournamentId: string;
  /** Match the winner advanced into, if any. */
  advancedToMatchId: string | null;
  tournamentCompleted: boolean;
}

/**
 * Records the winner of a bracket match and advances them into `nextMatchId` / `nextMatchSlot`.
 * Marks the next match READY once both slots are filled and completes the tournament after the final.
 */
export async function completeTournamentMatch(
  db: Database,
  input: CompleteTournamentMatchInput,
): Promise<CompleteTournamentMatchResult> {
  return db.transaction(async (tx) => {
    const [match] = await tx
      .select()
      .from(tournamentMatches)
      .where(eq(tournamentMatches.id, input.tournamentMatchId))
      .for('update');
    if (!match) throw new TournamentError('NOT_FOUND', 'Bracket match not found');
    if (match.status === 'COMPLETED' || match.status === 'BYE') {
      throw new TournamentError('INVALID_STATE', 'Bracket match is already decided');
    }
    if (input.winnerId !== match.player1Id && input.winnerId !== match.player2Id) {
      throw new TournamentError('INVALID_STATE', 'Winner is not a player of this match');
    }

    await tx
      .update(tournamentMatches)
      .set({
        winnerId: input.winnerId,
        status: 'COMPLETED',
        matchId: input.matchId ?? match.matchId,
      })
      .where(eq(tournamentMatches.id, match.id));

    if (!match.nextMatchId) {
      await tx
        .update(tournaments)
        .set({ status: 'COMPLETED' })
        .where(eq(tournaments.id, match.tournamentId));
      return { tournamentId: match.tournamentId, advancedToMatchId: null, tournamentCompleted: true };
    }

    const slotPatch =
      match.nextMatchSlot === 1 ? { player1Id: input.winnerId } : { player2Id: input.winnerId };
    const [next] = await tx
      .update(tournamentMatches)
      .set(slotPatch)
      .where(eq(tournamentMatches.id, match.nextMatchId))
      .returning();

    if (next && next.player1Id && next.player2Id && next.status === 'PENDING') {
      await tx
        .update(tournamentMatches)
        .set({ status: 'READY' })
        .where(eq(tournamentMatches.id, next.id));
    }

    return {
      tournamentId: match.tournamentId,
      advancedToMatchId: match.nextMatchId,
      tournamentCompleted: false,
    };
  });
}
