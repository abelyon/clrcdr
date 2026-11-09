import { closeDb, getDbHandle, requireDatabaseUrl } from '../client';
import { runMigrations } from '../migrate';

async function main(): Promise<void> {
  const host = new URL(requireDatabaseUrl()).host;
  console.info(`[db:migrate] target ${host}`);
  const { db, pool } = getDbHandle();
  await runMigrations(db, pool);
  console.info('[db:migrate] done');
}

main()
  .catch((error: unknown) => {
    console.error('[db:migrate] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
