import { randomBytes } from 'node:crypto';

export interface AppConfig {
  port: number;
  host: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  /** Allowed CORS origins; null means permissive. */
  webOrigins: string[] | null;
  matchCountdownMs: number;
  isProduction: boolean;
  rateLimit: { global: number; auth: number; enabled: boolean };
}

export const DEV_JWT_SECRET = 'clrcdr-dev-secret-do-not-use-in-production';

type Env = Record<string, string | undefined>;

function parseOrigins(raw: string | undefined): string[] | null {
  if (!raw) return null;
  const list = raw
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
  return list.length === 0 || list.includes('*') ? null : list;
}

function parseIntEnv(raw: string | undefined, fallback: number, min = 0): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= min ? n : fallback;
}

export function loadConfig(env: Env = process.env, warn: (msg: string) => void = console.warn): AppConfig {
  const isProduction = env.NODE_ENV === 'production';
  let jwtSecret = env.JWT_SECRET?.trim();
  if (!jwtSecret) {
    if (isProduction) {
      jwtSecret = randomBytes(48).toString('hex');
      warn('[config] JWT_SECRET is not set; using an ephemeral secret (sessions reset on restart)');
    } else {
      jwtSecret = DEV_JWT_SECRET;
    }
  }

  return {
    port: parseIntEnv(env.PORT, 4000, 0),
    host: '0.0.0.0',
    jwtSecret,
    jwtExpiresIn: env.JWT_EXPIRES_IN?.trim() || '7d',
    webOrigins: parseOrigins(env.WEB_ORIGIN ?? env.CORS_ORIGIN),
    matchCountdownMs: parseIntEnv(env.MATCH_COUNTDOWN_MS, 3000, 0),
    isProduction,
    rateLimit: { global: 600, auth: 20, enabled: true },
  };
}
