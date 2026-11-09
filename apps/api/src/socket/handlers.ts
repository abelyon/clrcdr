import { findUserById } from '@mastermind/db';
import {
  RATING,
  SOCKET_ROOMS,
  matchGuessPayloadSchema,
  matchRefPayloadSchema,
  roomJoinPayloadSchema,
  tournamentMatchJoinPayloadSchema,
  tournamentRefPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type InterServerEvents,
  type ServerToClientEvents,
  type SocketData,
  type SocketErrorCode,
} from '@mastermind/shared';
import type { Socket } from 'socket.io';
import type { ZodTypeAny, z } from 'zod';
import { bearerToken, verifyToken } from '../auth/tokens';
import type { AppContext } from '../context';
import { ApiError } from '../errors';
import { MatchError, type PlayerInfo } from '../services/matches';
import type { AppServer } from './realtime';

type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

const RATE_WINDOW_MS = 5000;
const RATE_MAX_EVENTS = 40;

function normalizeError(error: unknown): { code: SocketErrorCode; message: string } {
  if (error instanceof MatchError) return { code: error.code, message: error.message };
  if (error instanceof ApiError) {
    const code: SocketErrorCode =
      error.code === 'NOT_FOUND' ? 'NOT_FOUND' : error.code === 'FORBIDDEN' ? 'FORBIDDEN' : 'INTERNAL';
    return { code, message: error.message };
  }
  return { code: 'INTERNAL', message: 'Internal error' };
}

function extractAck(args: unknown[]): Ack<never> | undefined {
  const fn = args.find((a) => typeof a === 'function');
  return fn as Ack<never> | undefined;
}

export function attachSocketHandlers(io: AppServer, ctx: AppContext): void {
  const { config, logger } = ctx;

  io.use(async (socket, next) => {
    const auth = socket.handshake.auth as { token?: unknown } | undefined;
    const raw =
      (typeof auth?.token === 'string' ? auth.token : null) ??
      bearerToken(socket.handshake.headers.authorization) ??
      (typeof socket.handshake.query.token === 'string' ? socket.handshake.query.token : null);
    const principal = raw ? verifyToken(config, raw) : null;
    if (!principal) return next(new Error('UNAUTHORIZED'));

    let { username, role } = principal;
    let rating: number = RATING.INITIAL;
    if (!principal.isGuest) {
      const db = ctx.db.tryGet();
      if (db) {
        try {
          const user = await findUserById(db, principal.id);
          if (!user) return next(new Error('UNAUTHORIZED'));
          username = user.username;
          role = user.role;
          rating = user.rating;
        } catch (error) {
          logger.warn(`[socket] could not load user ${principal.id}: ${String(error)}`);
        }
      }
    }
    socket.data.userId = principal.id;
    socket.data.username = username;
    socket.data.role = role;
    socket.data.isGuest = principal.isGuest;
    socket.data.rating = rating;
    next();
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    void socket.join(SOCKET_ROOMS.user(userId));

    const recent: number[] = [];
    const limited = (): boolean => {
      const now = Date.now();
      while (recent.length > 0 && now - (recent[0] as number) > RATE_WINDOW_MS) recent.shift();
      recent.push(now);
      return recent.length > RATE_MAX_EVENTS;
    };

    const player = async (s: AppSocket): Promise<PlayerInfo> => {
      let rating = s.data.rating;
      if (!s.data.isGuest) {
        const db = ctx.db.tryGet();
        if (db) {
          try {
            const user = await findUserById(db, s.data.userId);
            if (user) rating = user.rating;
          } catch {
            /* keep the rating from connect time */
          }
        }
      }
      s.data.rating = rating;
      return { userId: s.data.userId, username: s.data.username, rating, isGuest: s.data.isGuest };
    };

    function fail(ack: Ack<never> | undefined, error: unknown, matchId?: string): void {
      const { code, message } = normalizeError(error);
      if (code === 'INTERNAL') logger.error(`[socket] handler error: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`);
      if (ack) (ack as (r: unknown) => void)({ ok: false, error: message, code });
      else socket.emit('match:error', { ...(matchId ? { matchId } : {}), code, message });
    }

    /** Registers an event with rate limiting, Zod validation and uniform ack/error handling. */
    function on<S extends ZodTypeAny | null>(
      event: Parameters<typeof socket.on>[0],
      schema: S,
      handler: (payload: S extends ZodTypeAny ? z.output<S> : undefined, ack: Ack<never> | undefined) => Promise<void>,
    ): void {
      (socket as unknown as { on: (e: string, l: (...args: unknown[]) => void) => void }).on(
        event as string,
        (...args: unknown[]) => {
          const ack = extractAck(args);
          void (async () => {
            try {
              if (limited()) throw new MatchError('RATE_LIMITED', 'Too many requests');
              let payload: unknown;
              if (schema) {
                const parsed = schema.safeParse(args[0]);
                if (!parsed.success) throw new MatchError('INVALID_PAYLOAD', 'Invalid payload');
                payload = parsed.data;
              }
              await handler(payload as never, ack);
            } catch (error) {
              const matchId =
                args[0] && typeof args[0] === 'object' && 'matchId' in args[0]
                  ? String((args[0] as { matchId: unknown }).matchId)
                  : undefined;
              fail(ack, error, matchId);
            }
          })();
        },
      );
    }

    const ok = (ack: Ack<never> | undefined, data?: unknown): void => {
      if (ack) (ack as (r: unknown) => void)(data === undefined ? { ok: true } : { ok: true, data });
    };

    on('1v1:queue:join', null, async (_p, ack) => {
      const status = await ctx.matchmaking.join(await player(socket));
      ok(ack, status);
    });

    on('1v1:queue:leave', null, async (_p, ack) => {
      await ctx.matchmaking.leave(userId);
      ok(ack);
    });

    on('1v1:room:create', null, async (_p, ack) => {
      const room = await ctx.matchmaking.createRoom(await player(socket));
      ok(ack, room);
    });

    on('1v1:room:join', roomJoinPayloadSchema, async (payload, ack) => {
      const state = await ctx.matchmaking.joinRoom(await player(socket), payload.code);
      ok(ack, state);
    });

    on('match:guess', matchGuessPayloadSchema, async (payload, ack) => {
      const result = await ctx.matches.guess(userId, payload.matchId, payload.guess);
      ok(ack, result);
    });

    on('match:rejoin', matchRefPayloadSchema, async (payload, ack) => {
      const started = await ctx.matches.rejoin(userId, payload.matchId);
      ok(ack, started);
    });

    on('match:forfeit', matchRefPayloadSchema, async (payload, ack) => {
      await ctx.matches.forfeit(userId, payload.matchId);
      ok(ack);
    });

    on('tournament:subscribe', tournamentRefPayloadSchema, async (payload, ack) => {
      await socket.join(SOCKET_ROOMS.tournament(payload.tournamentId));
      ok(ack);
      try {
        const detail = await ctx.tournaments.detail(payload.tournamentId);
        socket.emit('tournament:bracket_updated', {
          tournamentId: detail.id,
          status: detail.status,
          matches: detail.matches,
          winnerId: detail.winner?.id ?? null,
        });
      } catch (error) {
        socket.emit('match:error', {
          code: 'NOT_FOUND',
          message: error instanceof Error ? error.message : 'Tournament not found',
        });
      }
    });

    on('tournament:unsubscribe', tournamentRefPayloadSchema, async (payload, ack) => {
      await socket.leave(SOCKET_ROOMS.tournament(payload.tournamentId));
      ok(ack);
    });

    on('tournament:match:join', tournamentMatchJoinPayloadSchema, async (payload, ack) => {
      const result = await ctx.tournaments.joinMatch(await player(socket), payload);
      if (result.kind === 'started') {
        ok(ack, result.payload);
      } else if (ack) {
        (ack as (r: unknown) => void)({
          ok: false,
          code: 'MATCH_NOT_READY',
          error: 'Waiting for opponent',
        });
      }
    });

    socket.on('disconnect', () => {
      void (async () => {
        try {
          if (await ctx.realtime.isUserOnline(userId)) return;
          await ctx.matchmaking.leave(userId, false);
          await ctx.matchmaking.closeRoom(userId);
          await ctx.matches.onUserDisconnected(userId);
        } catch (error) {
          logger.warn(`[socket] disconnect cleanup failed: ${String(error)}`);
        }
      })();
    });

    void ctx.matches.onUserConnected(userId).catch((error) => {
      logger.warn(`[socket] resume failed: ${String(error)}`);
    });
  });
}
