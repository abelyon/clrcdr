import type { FastifyRequest } from 'fastify';
import { bearerToken, verifyToken, type Principal } from '../auth/tokens';
import type { AppConfig } from '../config';
import { forbidden, unauthorized } from '../errors';

/** Returns the caller, null when no Authorization header was sent, and throws 401 for a bad token. */
export function optionalPrincipal(request: FastifyRequest, config: AppConfig): Principal | null {
  const header = request.headers.authorization;
  if (!header) return null;
  const token = bearerToken(header);
  const principal = token ? verifyToken(config, token) : null;
  if (!principal) throw unauthorized('Invalid or expired token');
  return principal;
}

export function requirePrincipal(request: FastifyRequest, config: AppConfig): Principal {
  const principal = optionalPrincipal(request, config);
  if (!principal) throw unauthorized();
  return principal;
}

/** A signed-in, non-guest user. */
export function requireRegistered(request: FastifyRequest, config: AppConfig): Principal {
  const principal = requirePrincipal(request, config);
  if (principal.isGuest) throw forbidden('Guests cannot use this feature. Please register or log in.');
  return principal;
}

export function requireAdmin(request: FastifyRequest, config: AppConfig): Principal {
  const principal = requireRegistered(request, config);
  if (principal.role !== 'ADMIN') throw forbidden('Admin role required');
  return principal;
}
