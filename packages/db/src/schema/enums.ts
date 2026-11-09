import { pgEnum } from "drizzle-orm/pg-core";

export const USER_ROLES = ["USER", "ADMIN"] as const;
export const userRoleEnum = pgEnum("user_role", USER_ROLES);

export const LANGUAGES = ["en", "hu"] as const;
export const languageEnum = pgEnum("language", LANGUAGES);

export const THEMES = ["light", "dark", "system"] as const;
export const themeEnum = pgEnum("theme", THEMES);

export const GAME_MODES = ["SOLO", "ONE_VS_ONE"] as const;
export const gameModeEnum = pgEnum("game_mode", GAME_MODES);

export const GAME_STATUSES = ["IN_PROGRESS", "COMPLETED", "ABANDONED"] as const;
export const gameStatusEnum = pgEnum("game_status", GAME_STATUSES);

export const GAME_PLAYER_RESULTS = ["WIN", "LOSS", "DRAW", "ABANDONED"] as const;
export const gamePlayerResultEnum = pgEnum("game_player_result", GAME_PLAYER_RESULTS);

export const TOURNAMENT_STATUSES = [
  "DRAFT",
  "REGISTRATION",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
] as const;
export const tournamentStatusEnum = pgEnum("tournament_status", TOURNAMENT_STATUSES);

export const MATCH_STATUSES = ["PENDING", "READY", "IN_PROGRESS", "COMPLETED"] as const;
export const matchStatusEnum = pgEnum("match_status", MATCH_STATUSES);
