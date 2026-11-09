import { z } from "zod";

export const tournamentStatusSchema = z.enum(["pending", "active", "completed"]);
export type TournamentStatus = z.infer<typeof tournamentStatusSchema>;

export const matchStatusSchema = z.enum(["pending", "ready", "in_progress", "completed", "bye"]);
export type MatchStatus = z.infer<typeof matchStatusSchema>;

/** Mirrors the self-referencing `matches` table. */
export const tournamentMatchSchema = z.object({
  id: z.string().min(1),
  tournamentId: z.string().min(1),
  /** 1 = first round. */
  round: z.number().int().min(1),
  /** Zero-based slot within the round (for rendering order). */
  position: z.number().int().min(0),
  nextMatchId: z.string().nullable(),
  player1Id: z.string().nullable(),
  player2Id: z.string().nullable(),
  winnerId: z.string().nullable(),
  status: matchStatusSchema,
});
export type TournamentMatchDto = z.infer<typeof tournamentMatchSchema>;

export const tournamentSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  status: tournamentStatusSchema,
  playerCount: z.number().int().min(2),
  createdAt: z.string().datetime(),
});
export type TournamentDto = z.infer<typeof tournamentSchema>;

export const createTournamentSchema = z.object({
  name: z.string().min(1).max(80),
  playerIds: z.array(z.string().min(1)).min(2).max(256),
});
export type CreateTournamentDto = z.infer<typeof createTournamentSchema>;

export const tournamentBracketSchema = z.object({
  tournament: tournamentSchema,
  matches: z.array(tournamentMatchSchema),
});
export type TournamentBracketDto = z.infer<typeof tournamentBracketSchema>;
