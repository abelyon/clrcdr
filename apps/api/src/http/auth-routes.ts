import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import {
  createUser,
  findUserByEmail,
  findUserById,
  findUserByUsername,
  getUserSettings,
  toAuthUser,
  uniqueViolation,
  upsertUserSettings,
  verifyPassword,
} from '@mastermind/db';
import {
  DEFAULT_SETTINGS,
  RATING,
  guestSchema,
  loginSchema,
  registerSchema,
  updateSettingsSchema,
  type AuthResponse,
  type AuthUser,
  type UserSettings,
} from '@mastermind/shared';
import { signToken, type Principal } from '../auth/tokens';
import type { AppContext } from '../context';
import { conflict, parse, unauthorized } from '../errors';
import { requirePrincipal } from './guards';

export function guestUser(principal: Principal): AuthUser {
  return {
    id: principal.id,
    username: principal.username,
    email: null,
    role: 'PLAYER',
    rating: RATING.INITIAL,
    gamesPlayed: 0,
    gamesWon: 0,
    isGuest: true,
  };
}

export async function registerAuthRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config } = ctx;
  const authLimit = { config: { rateLimit: { max: config.rateLimit.auth, timeWindow: '1 minute' } } };

  app.post('/api/auth/register', authLimit, async (request, reply) => {
    const body = parse(registerSchema, request.body);
    const db = ctx.db.get();

    if (await findUserByEmail(db, body.email)) {
      throw conflict('Email is already registered', { field: 'email' });
    }
    if (await findUserByUsername(db, body.username)) {
      throw conflict('Username is already taken', { field: 'username' });
    }
    let user;
    try {
      user = await createUser(db, { username: body.username, email: body.email, password: body.password });
    } catch (error) {
      const violation = uniqueViolation(error);
      if (violation) {
        const field = violation.constraint?.includes('email') ? 'email' : 'username';
        throw conflict(field === 'email' ? 'Email is already registered' : 'Username is already taken', {
          field,
        });
      }
      throw error;
    }
    const principal: Principal = { id: user.id, username: user.username, role: user.role, isGuest: false };
    const response: AuthResponse = { token: signToken(config, principal), user: toAuthUser(user) };
    return reply.code(201).send(response);
  });

  app.post('/api/auth/login', authLimit, async (request) => {
    const body = parse(loginSchema, request.body);
    const db = ctx.db.get();
    const user = await findUserByEmail(db, body.email);
    const valid = user ? await verifyPassword(body.password, user.passwordHash) : false;
    if (!user || !valid) throw unauthorized('Invalid email or password');
    const principal: Principal = { id: user.id, username: user.username, role: user.role, isGuest: false };
    const response: AuthResponse = { token: signToken(config, principal), user: toAuthUser(user) };
    return response;
  });

  app.post('/api/auth/guest', authLimit, async (request, reply) => {
    const body = parse(guestSchema, request.body ?? {});
    const principal: Principal = {
      id: `g_${randomUUID()}`,
      username: body.username ?? `Guest-${randomUUID().slice(0, 4).toUpperCase()}`,
      role: 'PLAYER',
      isGuest: true,
    };
    const response: AuthResponse = { token: signToken(config, principal), user: guestUser(principal) };
    return reply.code(201).send(response);
  });

  app.get('/api/auth/me', async (request) => {
    const principal = requirePrincipal(request, config);
    if (principal.isGuest) return { user: guestUser(principal) };
    const user = await findUserById(ctx.db.get(), principal.id);
    if (!user) throw unauthorized('Account no longer exists');
    return { user: toAuthUser(user) };
  });

  app.get('/api/settings', async (request): Promise<UserSettings> => {
    const principal = requirePrincipal(request, config);
    if (principal.isGuest) return { ...DEFAULT_SETTINGS };
    return getUserSettings(ctx.db.get(), principal.id);
  });

  app.put('/api/settings', async (request): Promise<UserSettings> => {
    const principal = requirePrincipal(request, config);
    const patch = parse(updateSettingsSchema, request.body ?? {});
    if (principal.isGuest) {
      return {
        ...DEFAULT_SETTINGS,
        ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)),
      };
    }
    return upsertUserSettings(ctx.db.get(), principal.id, patch);
  });
}
