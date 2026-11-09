import { createDb, getDbHandle, type DbHandle } from './client';
import { runMigrations } from './migrate';
import { seedDatabase, type SeedResult } from './seed';

export interface EnsureOptions {
  /** Explicit connection string. Defaults to `resolveDatabaseUrl()` (public proxy preferred). */
  url?: string;
  /** Set false to only migrate. */
  seed?: boolean;
  logger?: Pick<Console, 'info' | 'warn'>;
}

export interface EnsureResult extends DbHandle {
  seeded: SeedResult | null;
}

let inflight: Promise<EnsureResult> | null = null;

/**
 * Creates/migrates all tables (drizzle SQL migrations, guarded by an advisory lock) and seeds the default
 * ADMIN `admin@clrcdr.gg` / `admin123`, demo players, sample leaderboard data and sample tournaments when missing.
 * Idempotent and safe to call on every startup, also concurrently. Returns the shared database handle.
 */
export function ensureDbReadyAndSeeded(options: EnsureOptions = {}): Promise<EnsureResult> {
  if (inflight && !options.url) return inflight;

  const run = (async (): Promise<EnsureResult> => {
    const logger = options.logger ?? console;
    const handle = options.url ? createDb(options.url) : getDbHandle();
    logger.info('[db] running migrations');
    await runMigrations(handle.db, handle.pool);
    let seeded: SeedResult | null = null;
    if (options.seed !== false) {
      seeded = await seedDatabase(handle.db);
      logger.info(
        `[db] seed complete (admin created: ${seeded.adminCreated}, demo players: ${seeded.demoPlayersCreated}, matches: ${seeded.matchesCreated}, tournaments: ${seeded.tournamentsCreated})`,
      );
    }
    return { ...handle, seeded };
  })();

  if (!options.url) {
    inflight = run;
    run.catch(() => {
      if (inflight === run) inflight = null;
    });
  }
  return run;
}
