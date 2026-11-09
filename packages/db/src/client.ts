import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool, type PoolConfig } from 'pg';
import { resolveDatabaseUrl } from '@mastermind/shared';
import * as schema from './schema';

export type Database = NodePgDatabase<typeof schema>;

export interface DbHandle {
  db: Database;
  pool: Pool;
}

export { resolveDatabaseUrl };

/** Resolves the connection string (public proxy preferred) or throws a descriptive error. */
export function requireDatabaseUrl(url?: string): string {
  const resolved = url ?? resolveDatabaseUrl();
  if (!resolved) {
    throw new Error(
      'No database URL configured. Set DATABASE_PUBLIC_URL (preferred locally) or DATABASE_URL.',
    );
  }
  return resolved;
}

export function createDb(url?: string, poolConfig: PoolConfig = {}): DbHandle {
  const pool = new Pool({
    connectionString: requireDatabaseUrl(url),
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ...poolConfig,
  });
  pool.on('error', () => {
    /* idle client errors must not crash the process; the pool replaces the client */
  });
  return { db: drizzle(pool, { schema }), pool };
}

let shared: DbHandle | null = null;

/** Process-wide singleton connection pool. */
export function getDbHandle(): DbHandle {
  if (!shared) shared = createDb();
  return shared;
}

export function getDb(): Database {
  return getDbHandle().db;
}

export function getPool(): Pool {
  return getDbHandle().pool;
}

export async function closeDb(): Promise<void> {
  if (shared) {
    const { pool } = shared;
    shared = null;
    await pool.end();
  }
}

export { schema };
