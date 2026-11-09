'use client';

import * as React from 'react';
import { io, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mastermind/shared';
import { SOCKET_URL } from '@/lib/config';
import { getToken } from '@/lib/storage';
import { useAuth } from './auth-provider';

export type GameSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export type SocketStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';

interface SocketContextValue {
  socket: GameSocket | null;
  status: SocketStatus;
  /** Registers interest in a live connection. Returns a release function. */
  acquire: () => () => void;
}

const SocketContext = React.createContext<SocketContextValue | null>(null);

const IDLE_CLOSE_MS = 2500;

export function SocketProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [socket, setSocket] = React.useState<GameSocket | null>(null);
  const [status, setStatus] = React.useState<SocketStatus>('idle');
  const [holders, setHolders] = React.useState(0);

  const acquire = React.useCallback(() => {
    setHolders((n) => n + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      // Delay the decrement so page-to-page navigation keeps one live connection.
      setTimeout(() => setHolders((n) => Math.max(0, n - 1)), IDLE_CLOSE_MS);
    };
  }, []);

  const wanted = holders > 0 && !!token;

  React.useEffect(() => {
    if (!wanted) return;

    const instance: GameSocket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getToken() ?? token }),
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 600,
      reconnectionDelayMax: 5000,
      timeout: 10000,
    });
    setStatus('connecting');
    instance.on('connect', () => setStatus('connected'));
    instance.on('disconnect', () => setStatus('disconnected'));
    instance.on('connect_error', () => setStatus('error'));
    instance.io.on('reconnect_attempt', () => setStatus('connecting'));
    setSocket(instance);

    return () => {
      instance.removeAllListeners();
      instance.disconnect();
      setSocket((current) => (current === instance ? null : current));
      setStatus('idle');
    };
  }, [wanted, token]);

  const value = React.useMemo(() => ({ socket, status, acquire }), [socket, status, acquire]);
  return <SocketContext.Provider value={value}>{children}</SocketContext.Provider>;
}

/** Keeps the shared socket connected while the calling component is mounted. */
export function useGameSocket(enabled = true): { socket: GameSocket | null; status: SocketStatus } {
  const ctx = React.useContext(SocketContext);
  if (!ctx) throw new Error('useGameSocket must be used inside <SocketProvider>');
  const { acquire } = ctx;
  React.useEffect(() => {
    if (!enabled) return;
    return acquire();
  }, [enabled, acquire]);
  return { socket: ctx.socket, status: ctx.status };
}
