import { relations } from "drizzle-orm";
import { gamePlayers, games } from "./games";
import { matches, tournamentParticipants, tournaments } from "./tournaments";
import { userSettings, users } from "./users";

export const usersRelations = relations(users, ({ one, many }) => ({
  settings: one(userSettings, { fields: [users.id], references: [userSettings.userId] }),
  gamePlayers: many(gamePlayers),
  wonGames: many(games, { relationName: "game_winner" }),
  createdTournaments: many(tournaments, { relationName: "tournament_creator" }),
  wonTournaments: many(tournaments, { relationName: "tournament_winner" }),
  tournamentParticipations: many(tournamentParticipants),
}));

export const userSettingsRelations = relations(userSettings, ({ one }) => ({
  user: one(users, { fields: [userSettings.userId], references: [users.id] }),
}));

export const gamesRelations = relations(games, ({ one, many }) => ({
  winner: one(users, {
    fields: [games.winnerId],
    references: [users.id],
    relationName: "game_winner",
  }),
  match: one(matches, { fields: [games.matchId], references: [matches.id] }),
  players: many(gamePlayers),
}));

export const gamePlayersRelations = relations(gamePlayers, ({ one }) => ({
  game: one(games, { fields: [gamePlayers.gameId], references: [games.id] }),
  user: one(users, { fields: [gamePlayers.userId], references: [users.id] }),
}));

export const tournamentsRelations = relations(tournaments, ({ one, many }) => ({
  creator: one(users, {
    fields: [tournaments.createdBy],
    references: [users.id],
    relationName: "tournament_creator",
  }),
  winner: one(users, {
    fields: [tournaments.winnerId],
    references: [users.id],
    relationName: "tournament_winner",
  }),
  participants: many(tournamentParticipants),
  matches: many(matches),
}));

export const tournamentParticipantsRelations = relations(tournamentParticipants, ({ one }) => ({
  tournament: one(tournaments, {
    fields: [tournamentParticipants.tournamentId],
    references: [tournaments.id],
  }),
  user: one(users, { fields: [tournamentParticipants.userId], references: [users.id] }),
}));

export const matchesRelations = relations(matches, ({ one, many }) => ({
  tournament: one(tournaments, { fields: [matches.tournamentId], references: [tournaments.id] }),
  nextMatch: one(matches, {
    fields: [matches.nextMatchId],
    references: [matches.id],
    relationName: "match_advancement",
  }),
  previousMatches: many(matches, { relationName: "match_advancement" }),
  player1: one(users, {
    fields: [matches.player1Id],
    references: [users.id],
    relationName: "match_player1",
  }),
  player2: one(users, {
    fields: [matches.player2Id],
    references: [users.id],
    relationName: "match_player2",
  }),
  winner: one(users, {
    fields: [matches.winnerId],
    references: [users.id],
    relationName: "match_winner",
  }),
  games: many(games),
}));
