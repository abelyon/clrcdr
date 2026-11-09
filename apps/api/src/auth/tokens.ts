import jwt from 'jsonwebtoken';
import { USER_ROLES, type UserRole } from '@mastermind/shared';
import type { AppConfig } from '../config';

export interface Principal {
  id: string;
  username: string;
  role: UserRole;
  isGuest: boolean;
}

export function signToken(config: Pick<AppConfig, 'jwtSecret' | 'jwtExpiresIn'>, principal: Principal): string {
  return jwt.sign(
    { username: principal.username, role: principal.role, guest: principal.isGuest },
    config.jwtSecret,
    {
      algorithm: 'HS256',
      subject: principal.id,
      expiresIn: config.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    },
  );
}

/** Returns the principal for a valid token, or null for anything invalid or expired. */
export function verifyToken(config: Pick<AppConfig, 'jwtSecret'>, token: string): Principal | null {
  try {
    const payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
    if (typeof payload === 'string' || typeof payload.sub !== 'string') return null;
    const role = payload.role as UserRole;
    if (!USER_ROLES.includes(role) || typeof payload.username !== 'string') return null;
    return {
      id: payload.sub,
      username: payload.username,
      role,
      isGuest: payload.guest === true,
    };
  } catch {
    return null;
  }
}

export function bearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? (match[1] as string).trim() : null;
}

export function isGuestId(id: string): boolean {
  return id.startsWith('g_');
}
