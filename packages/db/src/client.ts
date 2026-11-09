import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export interface CreateDbOptions {
  /** Defaults to `process.env.DATABASE_URL`. */
  connectionString?: string;
  /** Pass `{ rejectUnauthorized: false }` (or `true`) for managed Postgres that requires TLS. */
  ssl?: PoolConfig["ssl"];
  max?: number;
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

export interface DbClient {
  db: Database;
  pool: Pool;
  /** Ends the pool; call on process shutdown. */
  close: () => Promise<void>;
}

export function createDb(options: CreateDbOptions = {}): DbClient {
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set; pass connectionString to createDb()");
  }

  const pool = new Pool({
    connectionString,
    ssl: options.ssl,
    max: options.max ?? 10,
    idleTimeoutMillis: options.idleTimeoutMillis ?? 30_000,
    connectionTimeoutMillis: options.connectionTimeoutMillis ?? 10_000,
  });

  const db = drizzle(pool, { schema });
  return { db, pool, close: () => pool.end() };
}
