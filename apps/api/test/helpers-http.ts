import type { AddressInfo } from 'node:net';
import { io as connect, type Socket } from 'socket.io-client';
import type { ClientToServerEvents, ServerToClientEvents } from '@mastermind/shared';
import { buildApp, type BuiltApp } from '../src/app';
import { loadConfig } from '../src/config';
import { DbAccess } from '../src/db';
import { silentLogger } from '../src/lib/logger';
import { MemoryStore } from '../src/store';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

export interface TestServer extends BuiltApp {
  url: string;
  store: MemoryStore;
  stop(): Promise<void>;
}

export async function startTestServer(options: { db?: DbAccess; matchCountdownMs?: number } = {}): Promise<TestServer> {
  const config = loadConfig({ JWT_SECRET: 'test-secret', MATCH_COUNTDOWN_MS: String(options.matchCountdownMs ?? 0) });
  config.rateLimit.enabled = false;
  const store = new MemoryStore();
  const app = await buildApp({ config, store, db: options.db ?? new DbAccess(silentLogger), logger: silentLogger });
  await app.fastify.listen({ port: 0, host: '127.0.0.1' });
  const { port } = app.fastify.server.address() as AddressInfo;
  return {
    ...app,
    url: `http://127.0.0.1:${port}`,
    store,
    stop: () => app.close(),
  };
}

export async function api<T = unknown>(
  server: { url: string },
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<{ status: number; body: T }> {
  const res = await fetch(`${server.url}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as T };
}

export function createSocket(server: { url: string }, token: string): ClientSocket {
  return connect(server.url, { auth: { token }, transports: ['websocket'], reconnection: false });
}

export function connectSocket(server: { url: string }, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const socket = createSocket(server, token);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', (err) => reject(err));
  });
}

export function once<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  timeoutMs = 4000,
): Promise<Parameters<ServerToClientEvents[E]>[0]> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    (socket as unknown as { once: (e: string, cb: (p: unknown) => void) => void }).once(event, (payload) => {
      clearTimeout(timer);
      resolve(payload as Parameters<ServerToClientEvents[E]>[0]);
    });
  });
}

export function emitAck<T>(socket: ClientSocket, event: string, payload?: unknown): Promise<T> {
  return new Promise((resolve) => {
    const s = socket as unknown as { emit: (...args: unknown[]) => void };
    if (payload === undefined) s.emit(event, (res: T) => resolve(res));
    else s.emit(event, payload, (res: T) => resolve(res));
  });
}
