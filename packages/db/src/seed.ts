import { count, eq, inArray } from 'drizzle-orm';
import {
  MAX_ATTEMPTS,
  buildBracketPlan,
  calculateScore,
  evaluateGuess,
  generateSecret,
  type GuessRecord,
  type PegColor,
} from '@mastermind/shared';
import type { Database } from './client';
import { hashPassword } from './password';
import { createBracketRows } from './queries/tournaments';
import {
  matches,
  tournamentMatches,
  tournamentParticipants,
  tournaments,
  userSettings,
  users,
  type NewMatchRow,
  type User,
} from './schema';

export const ADMIN_SEED = {
  username: 'admin',
  email: 'admin@clrcdr.gg',
  password: 'admin123',
} as const;

export const DEMO_PASSWORD = 'demo123';

interface DemoPlayer {
  username: string;
  rating: number;
  /** Probability of cracking the code within the attempt limit. */
  skill: number;
  language: 'en' | 'hu';
}

export const DEMO_PLAYERS: readonly DemoPlayer[] = [
  { username: 'NovaCrack', rating: 1342, skill: 0.95, language: 'en' },
  { username: 'CipherFox', rating: 1288, skill: 0.92, language: 'en' },
  { username: 'Kódvadász', rating: 1215, skill: 0.88, language: 'hu' },
  { username: 'PixelMind', rating: 1174, skill: 0.84, language: 'en' },
  { username: 'EmberLock', rating: 1096, skill: 0.78, language: 'en' },
  { username: 'Rejtvényes', rating: 1031, skill: 0.72, language: 'hu' },
  { username: 'QuartzJack', rating: 968, skill: 0.64, language: 'en' },
  { username: 'MosaicMoe', rating: 902, skill: 0.55, language: 'en' },
];

export function demoEmail(username: string): string {
  const slug = username
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  return `${slug}@demo.clrcdr.gg`;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface SeededGame {
  secret: PegColor[];
  guesses: GuessRecord[];
  won: boolean;
  durationMs: number;
  score: number;
  completedAt: Date;
}

function simulateGame(rng: () => number, skill: number, completedAt: Date): SeededGame {
  const secret = generateSecret(rng);
  const won = rng() < skill;
  const attempts = won
    ? Math.min(MAX_ATTEMPTS, Math.max(2, Math.round(3 + (1 - skill) * 6 + rng() * 3)))
    : MAX_ATTEMPTS;
  const startedAt = completedAt.getTime();
  const durationMs = Math.round((won ? 25_000 + attempts * 9_000 : 130_000) * (0.7 + rng() * 0.8));

  const guesses: GuessRecord[] = [];
  for (let i = 0; i < attempts; i++) {
    const isLast = won && i === attempts - 1;
    let guess = isLast ? secret : generateSecret(rng);
    while (!isLast && guess.every((c, idx) => c === secret[idx])) guess = generateSecret(rng);
    const feedback = evaluateGuess(secret, guess);
    guesses.push({
      guess,
      exact: feedback.exact,
      partial: feedback.partial,
      at: startedAt - durationMs + Math.round(((i + 1) / attempts) * durationMs),
    });
  }

  const score = calculateScore({ won, attemptsUsed: attempts, durationMs }).total;
  return { secret, guesses, won, durationMs, score, completedAt };
}

export interface SeedResult {
  adminCreated: boolean;
  demoPlayersCreated: number;
  matchesCreated: number;
  tournamentsCreated: number;
}

/** Idempotent: every step checks for existing rows first, so repeated runs change nothing. */
export async function seedDatabase(db: Database): Promise<SeedResult> {
  const result: SeedResult = {
    adminCreated: false,
    demoPlayersCreated: 0,
    matchesCreated: 0,
    tournamentsCreated: 0,
  };

  const wantedEmails = [ADMIN_SEED.email, ...DEMO_PLAYERS.map((p) => demoEmail(p.username))];
  const existing = await db
    .select({ email: users.email })
    .from(users)
    .where(inArray(users.email, wantedEmails));
  const have = new Set(existing.map((u) => u.email));

  if (!have.has(ADMIN_SEED.email)) {
    const [admin] = await db
      .insert(users)
      .values({
        username: ADMIN_SEED.username,
        email: ADMIN_SEED.email,
        passwordHash: await hashPassword(ADMIN_SEED.password),
        role: 'ADMIN',
        rating: 1500,
      })
      .onConflictDoNothing()
      .returning();
    if (admin) {
      await db.insert(userSettings).values({ userId: admin.id }).onConflictDoNothing();
      result.adminCreated = true;
    }
  }

  const missingPlayers = DEMO_PLAYERS.filter((p) => !have.has(demoEmail(p.username)));
  if (missingPlayers.length > 0) {
    const passwordHash = await hashPassword(DEMO_PASSWORD);
    for (const player of missingPlayers) {
      const [created] = await db
        .insert(users)
        .values({
          username: player.username,
          email: demoEmail(player.username),
          passwordHash,
          role: 'PLAYER',
          rating: player.rating,
        })
        .onConflictDoNothing()
        .returning();
      if (created) {
        await db
          .insert(userSettings)
          .values({ userId: created.id, language: player.language })
          .onConflictDoNothing();
        result.demoPlayersCreated++;
      }
    }
  }

  const demoUsers = await db
    .select()
    .from(users)
    .where(
      inArray(
        users.email,
        DEMO_PLAYERS.map((p) => demoEmail(p.username)),
      ),
    );
  const demoByName = new Map(demoUsers.map((u) => [u.username, u]));
  const [admin] = await db.select().from(users).where(eq(users.email, ADMIN_SEED.email)).limit(1);

  result.matchesCreated = await seedSampleMatches(db, demoByName);
  result.tournamentsCreated = await seedSampleTournaments(db, demoByName, admin ?? null);
  return result;
}

async function seedSampleMatches(db: Database, demoByName: Map<string, User>): Promise<number> {
  const [row] = await db.select({ value: count() }).from(matches);
  if ((row?.value ?? 0) > 0 || demoByName.size === 0) return 0;

  const rng = mulberry32(20261109);
  const now = Date.now();
  const rows: NewMatchRow[] = [];
  const stats = new Map<
    string,
    { played: number; won: number; score: number; best: number | null; winAttempts: number }
  >();

  DEMO_PLAYERS.forEach((player, playerIndex) => {
    const user = demoByName.get(player.username);
    if (!user) return;
    const gamesCount = 9 + ((playerIndex * 3) % 7);
    const s = { played: 0, won: 0, score: 0, best: null as number | null, winAttempts: 0 };

    for (let g = 0; g < gamesCount; g++) {
      const daysAgo = rng() * 13;
      const completedAt = new Date(now - daysAgo * 86_400_000);
      const game = simulateGame(rng, player.skill, completedAt);
      rows.push({
        mode: 'SOLO',
        secretCode: game.secret,
        player1Id: user.id,
        winnerId: game.won ? user.id : null,
        player1Guesses: game.guesses,
        player1Score: game.score,
        durationMs: game.durationMs,
        status: 'COMPLETED',
        createdAt: new Date(completedAt.getTime() - game.durationMs),
        completedAt,
      });
      s.played++;
      s.score += game.score;
      if (game.won) {
        s.won++;
        s.winAttempts += game.guesses.length;
        s.best = s.best === null ? game.durationMs : Math.min(s.best, game.durationMs);
      }
    }
    stats.set(user.id, s);
  });

  if (rows.length === 0) return 0;
  await db.transaction(async (tx) => {
    await tx.insert(matches).values(rows);
    for (const [userId, s] of stats) {
      await tx
        .update(users)
        .set({
          gamesPlayed: s.played,
          gamesWon: s.won,
          totalScore: s.score,
          bestTimeMs: s.best,
          totalWinAttempts: s.winAttempts,
        })
        .where(eq(users.id, userId));
    }
  });
  return rows.length;
}

async function seedSampleTournaments(
  db: Database,
  demoByName: Map<string, User>,
  admin: User | null,
): Promise<number> {
  const ordered = DEMO_PLAYERS.map((p) => demoByName.get(p.username)).filter(
    (u): u is User => !!u,
  );
  if (ordered.length < 4) return 0;

  const existing = await db
    .select({ name: tournaments.name })
    .from(tournaments)
    .where(inArray(tournaments.name, ['CLRCDR Launch Cup', 'Founders Invitational']));
  const names = new Set(existing.map((t) => t.name));
  let created = 0;

  if (!names.has('CLRCDR Launch Cup')) {
    await db.transaction(async (tx) => {
      const [t] = await tx
        .insert(tournaments)
        .values({
          name: 'CLRCDR Launch Cup',
          description:
            'Open single-elimination bracket to celebrate the launch. Any number of players, BYEs fill the gaps.',
          status: 'REGISTRATION',
          maxPlayers: 12,
          createdById: admin?.id ?? null,
          startTime: new Date(Date.now() + 3 * 86_400_000),
        })
        .returning();
      if (!t) return;
      await tx
        .insert(tournamentParticipants)
        .values(ordered.slice(0, 5).map((u) => ({ tournamentId: t.id, userId: u.id })));
    });
    created++;
  }

  if (!names.has('Founders Invitational')) {
    await db.transaction(async (tx) => {
      const field = ordered.slice(0, 4);
      const [t] = await tx
        .insert(tournaments)
        .values({
          name: 'Founders Invitational',
          description: 'A four-player invitational between the first code breakers on CLRCDR.',
          status: 'COMPLETED',
          maxPlayers: 4,
          createdById: admin?.id ?? null,
          startTime: new Date(Date.now() - 6 * 86_400_000),
        })
        .returning();
      if (!t) return;

      await tx
        .insert(tournamentParticipants)
        .values(field.map((u, i) => ({ tournamentId: t.id, userId: u.id, seed: i + 1 })));

      const plan = buildBracketPlan(field.map((u) => u.id));
      const { rows } = createBracketRows(t.id, plan);
      const resolved = resolveBracketWinners(plan, rows);
      await tx.insert(tournamentMatches).values(resolved);
    });
    created++;
  }

  return created;
}

/** Marks every bracket match as COMPLETED, always advancing the better (lower) seed. */
function resolveBracketWinners(
  plan: ReturnType<typeof buildBracketPlan>,
  rows: ReturnType<typeof createBracketRows>['rows'],
): ReturnType<typeof createBracketRows>['rows'] {
  const byId = new Map(rows.map((r) => [r.id as string, { ...r }]));
  const ordered = [...byId.values()].sort(
    (a, b) => (a.round as number) - (b.round as number) || (a.matchOrder as number) - (b.matchOrder as number),
  );
  const seedOf = new Map<string, number>();
  plan.matches.forEach((m) => {
    if (m.player1Id && m.seed1) seedOf.set(m.player1Id, m.seed1);
    if (m.player2Id && m.seed2) seedOf.set(m.player2Id, m.seed2);
  });

  for (const row of ordered) {
    if (!row.player1Id || !row.player2Id) continue;
    const winner =
      (seedOf.get(row.player1Id) ?? 99) <= (seedOf.get(row.player2Id) ?? 99)
        ? row.player1Id
        : row.player2Id;
    row.winnerId = winner;
    row.status = 'COMPLETED';
    if (row.nextMatchId) {
      const next = byId.get(row.nextMatchId);
      if (next) {
        if (row.nextMatchSlot === 1) next.player1Id = winner;
        else next.player2Id = winner;
      }
    }
  }
  return ordered;
}