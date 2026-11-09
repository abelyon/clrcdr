'use client';

import * as React from 'react';
import type { AuthResponse, AuthUser, LoginInput, RegisterInput } from '@mastermind/shared';
import { api, ApiError } from '@/lib/api';
import { DEMO_ADMIN, STORAGE_KEYS } from '@/lib/config';
import { getToken, readStorage, setToken, writeStorage } from '@/lib/storage';

export type AuthMode = 'login' | 'register';
export type AuthStatus = 'loading' | 'ready';

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  status: AuthStatus;
  isAdmin: boolean;
  isGuest: boolean;
  login: (input: LoginInput) => Promise<AuthUser>;
  register: (input: RegisterInput) => Promise<AuthUser>;
  loginAsGuest: (username?: string) => Promise<AuthUser>;
  switchToDemoAdmin: () => Promise<AuthUser>;
  /** Returns the current user, creating a guest session when nobody is signed in. */
  ensureSession: () => Promise<AuthUser>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  authModalOpen: boolean;
  authModalMode: AuthMode;
  openAuthModal: (mode?: AuthMode) => void;
  closeAuthModal: () => void;
}

const AuthContext = React.createContext<AuthContextValue | null>(null);

function readCachedUser(): AuthUser | null {
  const raw = readStorage(STORAGE_KEYS.user);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = React.useState<AuthUser | null>(null);
  const [token, setTokenState] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<AuthStatus>('loading');
  const [authModalOpen, setAuthModalOpen] = React.useState(false);
  const [authModalMode, setAuthModalMode] = React.useState<AuthMode>('login');
  const userRef = React.useRef<AuthUser | null>(null);
  const pendingGuest = React.useRef<Promise<AuthUser> | null>(null);

  const commit = React.useCallback((nextUser: AuthUser | null, nextToken: string | null) => {
    userRef.current = nextUser;
    setUser(nextUser);
    setTokenState(nextToken);
    setToken(nextToken);
    writeStorage(STORAGE_KEYS.user, nextUser ? JSON.stringify(nextUser) : null);
  }, []);

  const applyAuth = React.useCallback(
    (response: AuthResponse): AuthUser => {
      commit(response.user, response.token);
      return response.user;
    },
    [commit],
  );

  React.useEffect(() => {
    const stored = getToken();
    if (!stored) {
      setStatus('ready');
      return;
    }
    const cached = readCachedUser();
    if (cached) {
      userRef.current = cached;
      setUser(cached);
    }
    setTokenState(stored);
    let cancelled = false;
    api
      .me(stored)
      .then((fresh) => {
        if (cancelled) return;
        commit(fresh, stored);
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof ApiError && (error.status === 401 || error.status === 403 || error.status === 404)) {
          commit(null, null);
        }
      })
      .finally(() => {
        if (!cancelled) setStatus('ready');
      });
    return () => {
      cancelled = true;
    };
  }, [commit]);

  const login = React.useCallback(async (input: LoginInput) => applyAuth(await api.login(input)), [applyAuth]);
  const register = React.useCallback(async (input: RegisterInput) => applyAuth(await api.register(input)), [applyAuth]);
  const loginAsGuest = React.useCallback(
    async (username?: string) => applyAuth(await api.guest(username ? { username } : {})),
    [applyAuth],
  );
  const switchToDemoAdmin = React.useCallback(
    async () => applyAuth(await api.login({ email: DEMO_ADMIN.email, password: DEMO_ADMIN.password })),
    [applyAuth],
  );

  const ensureSession = React.useCallback(async (): Promise<AuthUser> => {
    if (userRef.current && getToken()) return userRef.current;
    if (!pendingGuest.current) {
      pendingGuest.current = loginAsGuest().finally(() => {
        pendingGuest.current = null;
      });
    }
    return pendingGuest.current;
  }, [loginAsGuest]);

  const logout = React.useCallback(() => commit(null, null), [commit]);

  const refreshUser = React.useCallback(async () => {
    const current = getToken();
    if (!current) return;
    try {
      commit(await api.me(current), current);
    } catch {
      /* keep the cached profile when the refresh fails */
    }
  }, [commit]);

  const value = React.useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      status,
      isAdmin: user?.role === 'ADMIN',
      isGuest: !!user?.isGuest,
      login,
      register,
      loginAsGuest,
      switchToDemoAdmin,
      ensureSession,
      logout,
      refreshUser,
      authModalOpen,
      authModalMode,
      openAuthModal: (mode = 'login') => {
        setAuthModalMode(mode);
        setAuthModalOpen(true);
      },
      closeAuthModal: () => setAuthModalOpen(false),
    }),
    [
      user,
      token,
      status,
      login,
      register,
      loginAsGuest,
      switchToDemoAdmin,
      ensureSession,
      logout,
      refreshUser,
      authModalOpen,
      authModalMode,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = React.useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
