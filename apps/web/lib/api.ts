import {
  authResponseSchema,
  authUserSchema,
  guessResultSchema,
  leaderboardResponseSchema,
  soloStartResponseSchema,
  tournamentDetailSchema,
  tournamentListResponseSchema,
  userSettingsSchema,
  type AddParticipantsInput,
  type AuthResponse,
  type AuthUser,
  type CreateTournamentInput,
  type GuessRecord,
  type GuessResult,
  type PegColor,
  type ScoreBreakdown,
  type GuestInput,
  type LeaderboardPeriod,
  type LeaderboardResponse,
  type LoginInput,
  type RegisterInput,
  type SoloGuessRequest,
  type SoloStartResponse,
  type TournamentDetail,
  type TournamentSummary,
  type UpdateSettingsInput,
  type UserSettings,
} from '@mastermind/shared';
import type { ZodType } from 'zod';
import { API_URL } from './config';
import { getToken } from './storage';

export interface AdminUser {
  id: string;
  username: string;
  rating: number;
  isBot: boolean;
}

export interface SoloResume {
  gameId: string;
  codeLength: number;
  maxAttempts: number;
  palette: string[];
  startedAt: number;
  guesses: GuessRecord[];
  isGameOver: boolean;
  secretCode?: PegColor[];
}

export interface SubmitScoreResponse {
  submitted: boolean;
  score: ScoreBreakdown;
  rank: number | null;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  get isNetwork(): boolean {
    return this.status === 0;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface RequestOptions {
  method?: Method;
  body?: unknown;
  token?: string | null;
  signal?: AbortSignal;
  query?: Record<string, string | number | undefined>;
}

function errorMessageFrom(payload: unknown, fallback: string): { message: string; code?: string } {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    const nested = p.error && typeof p.error === 'object' ? (p.error as Record<string, unknown>) : null;
    const message =
      (typeof p.message === 'string' && p.message) ||
      (typeof p.error === 'string' && p.error) ||
      (nested && typeof nested.message === 'string' && nested.message) ||
      fallback;
    const code =
      (typeof p.code === 'string' && p.code) ||
      (nested && typeof nested.code === 'string' && nested.code) ||
      undefined;
    return { message, code: code || undefined };
  }
  return { message: fallback };
}

function errorDetailsFrom(payload: unknown): unknown {
  if (payload && typeof payload === 'object') {
    const p = payload as Record<string, unknown>;
    if (p.error && typeof p.error === 'object') return (p.error as Record<string, unknown>).details;
    return p.details;
  }
  return undefined;
}

export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, signal, query } = options;
  const token = options.token === undefined ? getToken() : options.token;

  let url = `${API_URL}${path}`;
  if (query) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) params.set(key, String(value));
    }
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: 'no-store',
    });
  } catch (error) {
    if ((error as { name?: string }).name === 'AbortError') throw error;
    throw new ApiError('Network error', 0, 'NETWORK');
  }

  const text = await response.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!response.ok) {
    const { message, code } = errorMessageFrom(payload, response.statusText || 'Request failed');
    throw new ApiError(message, response.status, code, errorDetailsFrom(payload));
  }
  return payload as T;
}

function parse<T>(schema: ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ApiError('Unexpected response from the server', 502, 'BAD_RESPONSE', result.error.flatten());
  }
  return result.data;
}

/** Accepts either `{ key: value }` or the bare value, so small server envelope changes do not break the UI. */
function unwrap(data: unknown, key: string): unknown {
  if (data && typeof data === 'object' && key in (data as Record<string, unknown>)) {
    return (data as Record<string, unknown>)[key];
  }
  return data;
}

export const api = {
  health: () => request<{ status?: string }>('/health', { token: null }),

  register: async (input: RegisterInput): Promise<AuthResponse> =>
    parse(authResponseSchema, await request('/api/auth/register', { method: 'POST', body: input, token: null })),

  login: async (input: LoginInput): Promise<AuthResponse> =>
    parse(authResponseSchema, await request('/api/auth/login', { method: 'POST', body: input, token: null })),

  guest: async (input: GuestInput = {}): Promise<AuthResponse> =>
    parse(authResponseSchema, await request('/api/auth/guest', { method: 'POST', body: input, token: null })),

  me: async (token?: string | null): Promise<AuthUser> =>
    parse(authUserSchema, unwrap(await request('/api/auth/me', { token }), 'user')),

  getSettings: async (): Promise<UserSettings> =>
    parse(userSettingsSchema, unwrap(await request('/api/settings'), 'settings')),

  updateSettings: async (input: UpdateSettingsInput): Promise<UserSettings> =>
    parse(userSettingsSchema, unwrap(await request('/api/settings', { method: 'PUT', body: input }), 'settings')),

  soloGet: async (gameId: string): Promise<SoloResume> =>
    request<SoloResume>(`/api/solo/${encodeURIComponent(gameId)}`),

  submitScore: (gameId: string) =>
    request<SubmitScoreResponse>('/api/leaderboard/submit', { method: 'POST', body: { gameId } }),

  soloStart: async (): Promise<SoloStartResponse> =>
    parse(soloStartResponseSchema, await request('/api/solo/start', { method: 'POST', body: {} })),

  soloGuess: async (input: SoloGuessRequest): Promise<GuessResult> =>
    parse(guessResultSchema, unwrap(await request('/api/solo/guess', { method: 'POST', body: input }), 'result')),

  leaderboard: async (period: LeaderboardPeriod, limit = 50, signal?: AbortSignal): Promise<LeaderboardResponse> =>
    parse(
      leaderboardResponseSchema,
      await request('/api/leaderboard', { query: { period, limit }, signal }),
    ),

  tournaments: async (signal?: AbortSignal): Promise<TournamentSummary[]> =>
    parse(tournamentListResponseSchema, await request('/api/tournaments', { signal })).tournaments,

  tournament: async (id: string, signal?: AbortSignal): Promise<TournamentDetail> =>
    parse(
      tournamentDetailSchema,
      unwrap(await request(`/api/tournaments/${encodeURIComponent(id)}`, { signal }), 'tournament'),
    ),

  createTournament: async (input: CreateTournamentInput): Promise<TournamentDetail> =>
    parse(tournamentDetailSchema, await request('/api/tournaments', { method: 'POST', body: input })),

  joinTournament: async (id: string): Promise<TournamentDetail> =>
    parse(tournamentDetailSchema, await request(`/api/tournaments/${encodeURIComponent(id)}/join`, { method: 'POST', body: {} })),

  leaveTournament: async (id: string): Promise<TournamentDetail> =>
    parse(tournamentDetailSchema, await request(`/api/tournaments/${encodeURIComponent(id)}/leave`, { method: 'POST', body: {} })),

  startTournament: async (id: string): Promise<TournamentDetail> =>
    parse(tournamentDetailSchema, await request(`/api/tournaments/${encodeURIComponent(id)}/start`, { method: 'POST', body: {} })),

  addTournamentParticipants: async (id: string, input: AddParticipantsInput): Promise<TournamentDetail> =>
    parse(
      tournamentDetailSchema,
      await request(`/api/tournaments/${encodeURIComponent(id)}/participants`, { method: 'POST', body: input }),
    ),

  removeTournamentParticipant: async (id: string, userId: string): Promise<TournamentDetail> =>
    parse(
      tournamentDetailSchema,
      await request(`/api/tournaments/${encodeURIComponent(id)}/participants/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      }),
    ),

  resetTournament: async (id: string): Promise<TournamentDetail> =>
    parse(tournamentDetailSchema, await request(`/api/tournaments/${encodeURIComponent(id)}/reset`, { method: 'POST', body: {} })),

  walkover: async (id: string, tournamentMatchId: string, winnerId: string): Promise<TournamentDetail> =>
    parse(
      tournamentDetailSchema,
      await request(
        `/api/tournaments/${encodeURIComponent(id)}/matches/${encodeURIComponent(tournamentMatchId)}/walkover`,
        { method: 'POST', body: { winnerId } },
      ),
    ),

  adminUsers: async (q = '', limit = 50): Promise<AdminUser[]> => {
    const data = await request<{ users: AdminUser[] }>('/api/admin/users', { query: { q: q || undefined, limit } });
    return data.users ?? [];
  },
};

export function describeError(error: unknown, fallback: string, networkMessage?: string): string {
  if (error instanceof ApiError) {
    if (error.isNetwork && networkMessage) return networkMessage;
    return error.message || fallback;
  }
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
