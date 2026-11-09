import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import {
  DEFAULT_SETTINGS,
  RATING,
  type AuthUser,
  type UpdateSettingsInput,
  type UserRole,
  type UserSettings,
} from '@mastermind/shared';
import type { Database } from '../client';
import { hashPassword } from '../password';
import { userSettings, users, type User } from '../schema';

export type DbLike = Pick<Database, 'select' | 'insert' | 'update' | 'delete' | 'execute'>;

export function toAuthUser(user: User, isGuest = false): AuthUser {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    rating: user.rating,
    gamesPlayed: user.gamesPlayed,
    gamesWon: user.gamesWon,
    isGuest,
  };
}

/** True when a Postgres error is a unique constraint violation; returns the constraint name if known. */
export function uniqueViolation(error: unknown): { constraint: string | undefined } | null {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  const code = e?.code ?? e?.cause?.code;
  if (code === '23505') return { constraint: e?.constraint ?? e?.cause?.constraint };
  return null;
}

export async function findUserById(db: DbLike, id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function findUserByEmail(db: DbLike, email: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.trim().toLowerCase()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserByUsername(db: DbLike, username: string): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`)
    .limit(1);
  return rows[0] ?? null;
}

export interface CreateUserInput {
  username: string;
  email: string;
  password?: string;
  passwordHash?: string;
  role?: UserRole;
  rating?: number;
  isBot?: boolean;
}

/** Creates a user plus default settings. Throws a unique violation (see `uniqueViolation`) on duplicates. */
export async function createUser(db: Database, input: CreateUserInput): Promise<User> {
  const passwordHash =
    input.passwordHash ?? (await hashPassword(input.password ?? randomUUID()));
  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({
        username: input.username,
        email: input.email.trim().toLowerCase(),
        passwordHash,
        role: input.role ?? 'PLAYER',
        rating: input.rating ?? RATING.INITIAL,
        isBot: input.isBot ?? false,
      })
      .returning();
    if (!user) throw new Error('Failed to create user');
    await tx.insert(userSettings).values({ userId: user.id }).onConflictDoNothing();
    return user;
  });
}

export async function getUserSettings(db: DbLike, userId: string): Promise<UserSettings> {
  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  const row = rows[0];
  if (!row) return { ...DEFAULT_SETTINGS };
  return {
    language: row.language,
    colorblindMode: row.colorblindMode,
    highContrast: row.highContrast,
    theme: row.theme,
    soundEnabled: row.soundEnabled,
  };
}

export async function upsertUserSettings(
  db: DbLike,
  userId: string,
  patch: UpdateSettingsInput,
): Promise<UserSettings> {
  const merged = { ...(await getUserSettings(db, userId)), ...stripUndefined(patch) };
  await db
    .insert(userSettings)
    .values({ userId, ...merged })
    .onConflictDoUpdate({ target: userSettings.userId, set: merged });
  return merged;
}

export interface MatchResultForUser {
  won: boolean;
  score: number;
  /** Duration in ms of the game; used for the best time of winning games. */
  durationMs: number;
  /** Number of guesses used (counted for winning games to compute average guesses). */
  attempts: number;
  ratingDelta?: number;
}

/** Atomically updates lifetime stats of a user after a finished game. */
export async function applyMatchResult(
  db: DbLike,
  userId: string,
  result: MatchResultForUser,
): Promise<User | null> {
  const won = result.won;
  const [updated] = await db
    .update(users)
    .set({
      gamesPlayed: sql`${users.gamesPlayed} + 1`,
      gamesWon: won ? sql`${users.gamesWon} + 1` : users.gamesWon,
      totalScore: sql`${users.totalScore} + ${Math.max(0, Math.round(result.score))}`,
      totalWinAttempts: won
        ? sql`${users.totalWinAttempts} + ${Math.max(0, Math.round(result.attempts))}`
        : users.totalWinAttempts,
      bestTimeMs: won
        ? sql`CASE WHEN ${users.bestTimeMs} IS NULL OR ${users.bestTimeMs} > ${Math.round(result.durationMs)} THEN ${Math.round(result.durationMs)} ELSE ${users.bestTimeMs} END`
        : users.bestTimeMs,
      rating: result.ratingDelta
        ? sql`GREATEST(${RATING.MIN}, ${users.rating} + ${Math.round(result.ratingDelta)})`
        : users.rating,
    })
    .where(eq(users.id, userId))
    .returning();
  return updated ?? null;
}

function stripUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined)) as Partial<T>;
}
