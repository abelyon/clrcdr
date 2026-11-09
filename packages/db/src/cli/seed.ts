import { closeDb, requireDatabaseUrl } from '../client';
import { ensureDbReadyAndSeeded } from '../ensure';

async function main(): Promise<void> {
  const url = requireDatabaseUrl();
  const host = new URL(url).host;
  console.info(`[db:seed] target ${host}`);
  const { seeded } = await ensureDbReadyAndSeeded();
  console.info('[db:seed] done', seeded);
}

main()
  .catch((error: unknown) => {
    console.error('[db:seed] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => closeDb());
