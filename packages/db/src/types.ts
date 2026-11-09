import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import type { gamePlayers, games } from "./schema/games";
import type { matches, tournamentParticipants, tournaments } from "./schema/tournaments";
import type { userSettings, users } from "./schema/users";
import type {
  GAME_MODES,
  GAME_PLAYER_RESULTS,
  GAME_STATUSES,
  LANGUAGES,
  MATCH_STATUSES,
  THEMES,
  TOURNAMENT_STATUSES,
  USER_ROLES,
} from "./schema/enums";

export type User = InferSelectModel<typeof users>;
export type NewUser = InferInsertModel<typeof users>;
/** User row without credentials; safe to return from the API. */
export type PublicUser = Omit<User, "passwordHash">;

export type UserSettings = InferSelectModel<typeof userSettings>;
export type NewUserSettings = InferInsertModel<typeof userSettings>;

export type Game = InferSelectModel<typeof games>;
export type NewGame = InferInsertModel<typeof games>;

export type GamePlayer = InferSelectModel<typeof gamePlayers>;
export type NewGamePlayer = InferInsertModel<typeof gamePlayers>;

export type Tournament = InferSelectModel<typeof tournaments>;
export type NewTournament = InferInsertModel<typeof tournaments>;

export type TournamentParticipant = InferSelectModel<typeof tournamentParticipants>;
export type NewTournamentParticipant = InferInsertModel<typeof tournamentParticipants>;

export type Match = InferSelectModel<typeof matches>;
export type NewMatch = InferInsertModel<typeof matches>;

export type UserRole = (typeof USER_ROLES)[number];
export type Language = (typeof LANGUAGES)[number];
export type Theme = (typeof THEMES)[number];
export type GameMode = (typeof GAME_MODES)[number];
export type GameStatus = (typeof GAME_STATUSES)[number];
export type GamePlayerResult = (typeof GAME_PLAYER_RESULTS)[number];
export type TournamentStatus = (typeof TOURNAMENT_STATUSES)[number];
export type MatchStatus = (typeof MATCH_STATUSES)[number];
