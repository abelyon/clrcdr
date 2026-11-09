import { ensureDbReadyAndSeeded, getDb, type Database } from '@mastermind/db';
import { resolveDatabaseUrl } from '@mastermind/shared';
import { unavailable } from './errors';
import type { Logger } from './lib/logger';

/** Tracks Postgres availability. The API keeps serving guest/solo play while Postgres is down and retries in the background. */
export class DbAccess {
  private ready = false;
  private retryTimer: NodeJS.Timeout | null = null;
  private onReadyHandlers: (() => void | Promise<void>)[] = [];

  constructor(
    private readonly logger: Logger,
    private readonly provider: () => Database = getDb,
  ) {}

  get isReady(): boolean {
    return this.ready;
  }

  /** Marks the database as usable without running migrations (tests and externally managed databases). */
  markReady(): void {
    this.ready = true;
  }

  onReady(handler: () => void | Promise<void>): void {
    this.onReadyHandlers.push(handler);
    if (this.ready) void handler();
  }

  /** Throws a 503 ApiError when Postgres is not available. */
  get(): Database {
    if (!this.ready) throw unavailable();
    return this.provider();
  }

  /** Returns the database when ready, otherwise null. */
  tryGet(): Database | null {
    return this.ready ? this.provider() : null;
  }

  /**
   * Runs migrations + seed once before the server listens (waiting at most `waitMs`). When Postgres is not
   * reachable the API still starts and keeps retrying in the background.
   */
  async initialize(waitMs = 20_000, retryEveryMs = 10_000): Promise<boolean> {
    if (!resolveDatabaseUrl()) {
      this.logger.warn('[db] no database URL configured, running without Postgres');
      return false;
    }
    const first = this.attempt();
    const ok = await Promise.race([
      first,
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs).unref()),
    ]);
    if (ok) return true;

    this.logger.warn(`[db] not ready yet, retrying every ${Math.round(retryEveryMs / 1000)}s in the background`);
    this.retryTimer = setInterval(() => {
      void this.attempt().then((done) => {
        if (done && this.retryTimer) {
          clearInterval(this.retryTimer);
          this.retryTimer = null;
        }
      });
    }, retryEveryMs);
    this.retryTimer.unref();
    return false;
  }

  private async attempt(): Promise<boolean> {
    try {
      await ensureDbReadyAndSeeded({ logger: this.logger });
      this.ready = true;
      for (const handler of this.onReadyHandlers) {
        try {
          await handler();
        } catch (error) {
          this.logger.warn(`[db] ready handler failed: ${String(error)}`);
        }
      }
      return true;
    } catch (error) {
      this.logger.warn(`[db] startup failed: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  stop(): void {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }
}
