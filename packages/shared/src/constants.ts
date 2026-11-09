export const CODE_LENGTH = 4;
export const MAX_ATTEMPTS = 10;

export const ALL_PEG_COLORS = ['R', 'G', 'B', 'Y', 'P', 'O', 'C', 'M'] as const;
export type PegColor = (typeof ALL_PEG_COLORS)[number];

/** Colors used in actual games (keyboard shortcuts 1-6). */
export const GAME_PALETTE = ['R', 'G', 'B', 'Y', 'P', 'O'] as const satisfies readonly PegColor[];
export type GameColor = (typeof GAME_PALETTE)[number];

export type PegShape =
  | 'triangle'
  | 'square'
  | 'circle'
  | 'diamond'
  | 'star'
  | 'cross'
  | 'hexagon'
  | 'heart';

export interface PegMeta {
  id: PegColor;
  /** CSS hex color of the peg. */
  hex: string;
  /** Slightly darker hex for borders/shadows. */
  hexDark: string;
  /** Readable text color on top of the peg. */
  textColor: string;
  /** Single colorblind-friendly letter, unique per color. */
  letter: string;
  /** Colorblind-friendly unicode symbol, unique per color. */
  symbol: string;
  shape: PegShape;
  /** SVG path in a 24x24 viewBox that draws the colorblind shape (fill it, centered). */
  svgPath: string;
  /** Dictionary key under `colors.*` for the localized name. */
  nameKey: ColorNameKey;
}

export type ColorNameKey =
  | 'colors.R'
  | 'colors.G'
  | 'colors.B'
  | 'colors.Y'
  | 'colors.P'
  | 'colors.O'
  | 'colors.C'
  | 'colors.M';

export const PEG_META: Record<PegColor, PegMeta> = {
  R: {
    id: 'R',
    hex: '#ef4444',
    hexDark: '#b91c1c',
    textColor: '#ffffff',
    letter: 'R',
    symbol: '\u25B2',
    shape: 'triangle',
    svgPath: 'M12 3 L22 20 H2 Z',
    nameKey: 'colors.R',
  },
  G: {
    id: 'G',
    hex: '#22c55e',
    hexDark: '#15803d',
    textColor: '#052e16',
    letter: 'G',
    symbol: '\u25A0',
    shape: 'square',
    svgPath: 'M4 4 H20 V20 H4 Z',
    nameKey: 'colors.G',
  },
  B: {
    id: 'B',
    hex: '#3b82f6',
    hexDark: '#1d4ed8',
    textColor: '#ffffff',
    letter: 'B',
    symbol: '\u25CF',
    shape: 'circle',
    svgPath: 'M3 12 A9 9 0 1 0 21 12 A9 9 0 1 0 3 12 Z',
    nameKey: 'colors.B',
  },
  Y: {
    id: 'Y',
    hex: '#facc15',
    hexDark: '#a16207',
    textColor: '#422006',
    letter: 'Y',
    symbol: '\u25C6',
    shape: 'diamond',
    svgPath: 'M12 2 L22 12 L12 22 L2 12 Z',
    nameKey: 'colors.Y',
  },
  P: {
    id: 'P',
    hex: '#a855f7',
    hexDark: '#7e22ce',
    textColor: '#ffffff',
    letter: 'P',
    symbol: '\u2605',
    shape: 'star',
    svgPath:
      'M12 2 L14.94 8.62 L22 9.27 L16.7 14.14 L18.18 21.02 L12 17.5 L5.82 21.02 L7.3 14.14 L2 9.27 L9.06 8.62 Z',
    nameKey: 'colors.P',
  },
  O: {
    id: 'O',
    hex: '#f97316',
    hexDark: '#c2410c',
    textColor: '#431407',
    letter: 'O',
    symbol: '\u271A',
    shape: 'cross',
    svgPath: 'M9 2 H15 V9 H22 V15 H15 V22 H9 V15 H2 V9 H9 Z',
    nameKey: 'colors.O',
  },
  C: {
    id: 'C',
    hex: '#06b6d4',
    hexDark: '#0e7490',
    textColor: '#083344',
    letter: 'C',
    symbol: '\u2B22',
    shape: 'hexagon',
    svgPath: 'M12 2 L20.66 7 V17 L12 22 L3.34 17 V7 Z',
    nameKey: 'colors.C',
  },
  M: {
    id: 'M',
    hex: '#ec4899',
    hexDark: '#be185d',
    textColor: '#500724',
    letter: 'M',
    symbol: '\u2665',
    shape: 'heart',
    svgPath:
      'M12 21 C12 21 2 14.5 2 8.5 A5 5 0 0 1 12 6.5 A5 5 0 0 1 22 8.5 C22 14.5 12 21 12 21 Z',
    nameKey: 'colors.M',
  },
};

export const PEG_LIST: readonly PegMeta[] = ALL_PEG_COLORS.map((c) => PEG_META[c]);

export type FeedbackPegKind = 'exact' | 'partial' | 'empty';

export const FEEDBACK_META = {
  exact: { hex: '#111827', hexColorblind: '#16a34a', label: 'exact' },
  partial: { hex: '#f9fafb', hexColorblind: '#eab308', label: 'partial' },
  empty: { hex: 'transparent', hexColorblind: 'transparent', label: 'empty' },
} as const;

export const SCORING = {
  /** Awarded for cracking the code. */
  BASE_WIN_POINTS: 1000,
  /** Awarded per unused attempt on a win. */
  POINTS_PER_UNUSED_ATTEMPT: 100,
  /** Maximum speed bonus, decays linearly to zero over TIME_BONUS_WINDOW_MS. */
  MAX_TIME_BONUS: 500,
  TIME_BONUS_WINDOW_MS: 5 * 60 * 1000,
  /** Consolation points for finishing a game without cracking it. */
  LOSS_POINTS: 0,
} as const;

export const RATING = {
  INITIAL: 1000,
  K_FACTOR: 32,
  MIN: 100,
} as const;

export const GAME_LIMITS = {
  /** Hard cap for a single 1v1 match before it is abandoned. */
  MATCH_TIMEOUT_MS: 15 * 60 * 1000,
  /** Grace period before a disconnected player forfeits. */
  DISCONNECT_GRACE_MS: 30 * 1000,
  ROOM_CODE_LENGTH: 6,
  ROOM_CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
} as const;

export const LANGUAGES = ['en', 'hu'] as const;
export type Language = (typeof LANGUAGES)[number];
export const DEFAULT_LANGUAGE: Language = 'en';

export const THEMES = ['dark', 'light'] as const;
export type Theme = (typeof THEMES)[number];

export const USER_ROLES = ['PLAYER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const MATCH_MODES = ['SOLO', '1V1', 'TOURNAMENT'] as const;
export type MatchMode = (typeof MATCH_MODES)[number];

export const MATCH_STATUSES = ['ACTIVE', 'COMPLETED', 'ABANDONED'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export const TOURNAMENT_STATUSES = ['REGISTRATION', 'IN_PROGRESS', 'COMPLETED'] as const;
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];

export const TOURNAMENT_MATCH_STATUSES = [
  'PENDING',
  'READY',
  'IN_PROGRESS',
  'BYE',
  'COMPLETED',
] as const;
export type TournamentMatchStatus = (typeof TOURNAMENT_MATCH_STATUSES)[number];

export const LEADERBOARD_PERIODS = ['alltime', 'weekly'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export const TOURNAMENT_LIMITS = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 128,
} as const;

export const DEFAULT_SETTINGS = {
  language: DEFAULT_LANGUAGE,
  colorblindMode: false,
  highContrast: false,
  theme: 'dark' as Theme,
  soundEnabled: true,
} as const;

export const REDIS_KEYS = {
  leaderboardAllTime: 'lb:alltime',
  leaderboardWeekly: (weekId: string) => `lb:weekly:${weekId}`,
  game: (gameId: string) => `game:${gameId}`,
  room: (code: string) => `room:${code}`,
  match: (matchId: string) => `match:${matchId}`,
  queue: '1v1:queue',
} as const;

export const SOCKET_ROOMS = {
  match: (matchId: string) => `match:${matchId}`,
  tournament: (tournamentId: string) => `tournament:${tournamentId}`,
  user: (userId: string) => `user:${userId}`,
} as const;
