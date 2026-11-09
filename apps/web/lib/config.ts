const stripSlash = (value: string): string => value.replace(/\/+$/, '');

/** Base URL of the REST API, e.g. `http://localhost:4000`. */
export const API_URL = stripSlash(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000');

/** Socket.io connects to the API origin unless overridden. */
export const SOCKET_URL = stripSlash(process.env.NEXT_PUBLIC_SOCKET_URL || API_URL);

export const DEMO_ADMIN = { email: 'admin@clrcdr.gg', password: 'admin123' } as const;

export const STORAGE_KEYS = {
  token: 'clrcdr.token',
  settings: 'clrcdr.settings',
  user: 'clrcdr.user',
} as const;
