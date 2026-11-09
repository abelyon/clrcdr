import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import Fastify, { type FastifyInstance } from 'fastify';
import { Server } from 'socket.io';
import type { AppConfig } from './config';
import type { AppContext } from './context';
import type { DbAccess } from './db';
import { ApiError, badRequest, errorBody, notFound } from './errors';
import { registerAuthRoutes } from './http/auth-routes';
import { registerGameRoutes } from './http/game-routes';
import { registerTournamentRoutes } from './http/tournament-routes';
import type { Logger } from './lib/logger';
import { DEFAULT_TIMINGS, MatchService, type MatchTimings } from './services/matches';
import { LeaderboardService } from './services/leaderboard';
import { MatchmakingService } from './services/matchmaking';
import { SoloService } from './services/solo';
import { TournamentService } from './services/tournaments';
import { attachSocketHandlers } from './socket/handlers';
import { SocketRealtime, type AppServer } from './socket/realtime';
import type { Store } from './store';

export interface BuildAppOptions {
  config: AppConfig;
  store: Store;
  db: DbAccess;
  logger: Logger;
  timings?: Partial<MatchTimings>;
}

export interface BuiltApp {
  fastify: FastifyInstance;
  io: AppServer;
  ctx: AppContext;
  close(): Promise<void>;
}

export async function buildApp(options: BuildAppOptions): Promise<BuiltApp> {
  const { config, store, db, logger } = options;

  const fastify = Fastify({ logger: false, trustProxy: true, bodyLimit: 64 * 1024 });
  const corsOrigin = config.webOrigins ?? true;

  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (_request, body, done) => {
    if (typeof body !== 'string' || body.trim() === '') return done(null, {});
    try {
      done(null, JSON.parse(body));
    } catch {
      done(badRequest('Request body is not valid JSON'), undefined);
    }
  });

  await fastify.register(cors, {
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 86_400,
  });
  await fastify.register(rateLimit, {
    global: config.rateLimit.enabled,
    max: config.rateLimit.global,
    timeWindow: '1 minute',
  });

  fastify.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError) return reply.code(error.status).send(errorBody(error));
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 429) {
      return reply.code(429).send(errorBody(new ApiError('RATE_LIMITED', 'Too many requests, slow down')));
    }
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      return reply
        .code(statusCode)
        .send(errorBody(new ApiError('VALIDATION_ERROR', (error as Error).message || 'Bad request')));
    }
    logger.error(`[http] unhandled error: ${(error as Error).stack ?? String(error)}`);
    return reply.code(500).send(errorBody(new ApiError('INTERNAL', 'Internal server error')));
  });
  fastify.setNotFoundHandler((_request, reply) =>
    reply.code(404).send(errorBody(notFound('Route not found'))),
  );

  const io: AppServer = new Server(fastify.server, {
    cors: { origin: corsOrigin, credentials: false },
    serveClient: false,
    pingInterval: 10_000,
    pingTimeout: 10_000,
    maxHttpBufferSize: 64 * 1024,
  });
  const realtime = new SocketRealtime(io);

  const timings: MatchTimings = {
    countdownMs: config.matchCountdownMs,
    ...DEFAULT_TIMINGS,
    ...options.timings,
  };
  const leaderboard = new LeaderboardService(store, db, logger);
  const matches = new MatchService(store, realtime, db, leaderboard, logger, timings);
  const ctx: AppContext = {
    config,
    logger,
    store,
    db,
    realtime,
    leaderboard,
    solo: new SoloService(store, db, leaderboard, logger),
    matches,
    matchmaking: new MatchmakingService(store, realtime, matches, logger),
    tournaments: new TournamentService(store, db, realtime, matches, logger),
  };

  fastify.get('/health', { config: { rateLimit: false } }, async () => ({
    status: 'ok',
    uptime: Math.round(process.uptime()),
    store: store.mode,
    db: db.isReady,
    time: new Date().toISOString(),
  }));

  await registerAuthRoutes(fastify, ctx);
  await registerGameRoutes(fastify, ctx);
  await registerTournamentRoutes(fastify, ctx);
  attachSocketHandlers(io, ctx);

  await fastify.ready();

  return {
    fastify,
    io,
    ctx,
    async close() {
      matches.shutdown();
      await new Promise<void>((resolve) => {
        void io.close(() => resolve());
      });
      await fastify.close().catch(() => undefined);
    },
  };
}

