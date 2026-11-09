import type { FastifyInstance } from 'fastify';
import {
  leaderboardQuerySchema,
  soloGuessRequestSchema,
  submitScoreSchema,
  type LeaderboardResponse,
} from '@mastermind/shared';
import type { AppContext } from '../context';
import { parse } from '../errors';
import { optionalPrincipal, requireRegistered } from './guards';

export async function registerGameRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config } = ctx;

  app.post('/api/solo/start', async (request) => ctx.solo.start(optionalPrincipal(request, config)));

  app.post('/api/solo/guess', async (request) => {
    const body = parse(soloGuessRequestSchema, request.body);
    return ctx.solo.guess(body.gameId, body.guess, optionalPrincipal(request, config));
  });

  app.get<{ Params: { gameId: string } }>('/api/solo/:gameId', async (request) =>
    ctx.solo.snapshot(request.params.gameId, optionalPrincipal(request, config)),
  );

  app.post('/api/leaderboard/submit', async (request) => {
    const principal = requireRegistered(request, config);
    const body = parse(submitScoreSchema, request.body);
    return ctx.solo.submit(body.gameId, principal);
  });

  app.get('/api/leaderboard', async (request): Promise<LeaderboardResponse> => {
    const query = parse(leaderboardQuerySchema, request.query);
    const entries = await ctx.leaderboard.get(query.period, query.limit);
    return { period: query.period, entries };
  });
}
