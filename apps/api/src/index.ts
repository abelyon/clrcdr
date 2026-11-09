import { closeDb } from '@mastermind/db';
import { buildApp } from './app';
import { loadConfig } from './config';
import { DbAccess } from './db';
import { consoleLogger as logger } from './lib/logger';
import { createStore } from './store';

async function main(): Promise<void> {
  const config = loadConfig();
  const db = new DbAccess(logger);

  await db.initialize();
  const store = await createStore({ logger });
  const app = await buildApp({ config, store, db, logger });
  db.onReady(() => app.ctx.leaderboard.warm());

  await app.fastify.listen({ port: config.port, host: config.host });
  logger.info(
    `[api] listening on http://${config.host}:${config.port} (store: ${store.mode}, db: ${db.isReady ? 'ready' : 'unavailable'})`,
  );

  let stopping = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (stopping) return;
    stopping = true;
    logger.info(`[api] ${signal} received, shutting down`);
    const force = setTimeout(() => process.exit(1), 10_000);
    force.unref();
    db.stop();
    await app.close();
    await store.close().catch(() => undefined);
    await closeDb().catch(() => undefined);
    process.exit(0);
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

process.on('unhandledRejection', (reason) => {
  logger.error(`[api] unhandled rejection: ${reason instanceof Error ? (reason.stack ?? reason.message) : String(reason)}`);
});

main().catch((error) => {
  logger.error(`[api] fatal: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
  process.exit(1);
});
