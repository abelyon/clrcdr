import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { addParticipantsSchema, createTournamentSchema } from '@mastermind/shared';
import type { AppContext } from '../context';
import { parse } from '../errors';
import { optionalPrincipal, requireAdmin, requireRegistered } from './guards';

const walkoverSchema = z.object({ winnerId: z.string().uuid() });
const adminUsersQuery = z.object({
  q: z.string().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function registerTournamentRoutes(app: FastifyInstance, ctx: AppContext): Promise<void> {
  const { config, tournaments } = ctx;

  app.get('/api/tournaments', async (request) => {
    const viewer = optionalPrincipal(request, config);
    return { tournaments: await tournaments.list(viewer && !viewer.isGuest ? viewer.id : undefined) };
  });

  app.get<{ Params: { id: string } }>('/api/tournaments/:id', async (request) => {
    const viewer = optionalPrincipal(request, config);
    return tournaments.detail(request.params.id, viewer && !viewer.isGuest ? viewer.id : undefined);
  });

  app.post('/api/tournaments', async (request, reply) => {
    const admin = requireAdmin(request, config);
    const body = parse(createTournamentSchema, request.body);
    return reply.code(201).send(await tournaments.create(body, admin));
  });

  app.post<{ Params: { id: string } }>('/api/tournaments/:id/join', async (request) =>
    tournaments.join(request.params.id, requireRegistered(request, config)),
  );

  app.post<{ Params: { id: string } }>('/api/tournaments/:id/leave', async (request) =>
    tournaments.leave(request.params.id, requireRegistered(request, config)),
  );

  app.post<{ Params: { id: string } }>('/api/tournaments/:id/start', async (request) => {
    const admin = requireAdmin(request, config);
    return tournaments.start(request.params.id, admin.id);
  });

  app.post<{ Params: { id: string } }>('/api/tournaments/:id/reset', async (request) => {
    const admin = requireAdmin(request, config);
    return tournaments.reset(request.params.id, admin.id);
  });

  app.post<{ Params: { id: string } }>('/api/tournaments/:id/participants', async (request) => {
    const admin = requireAdmin(request, config);
    const body = parse(addParticipantsSchema, request.body ?? {});
    return tournaments.addPlayers(request.params.id, body, admin.id);
  });

  app.delete<{ Params: { id: string; userId: string } }>(
    '/api/tournaments/:id/participants/:userId',
    async (request) => {
      const admin = requireAdmin(request, config);
      return tournaments.removePlayer(request.params.id, request.params.userId, admin.id);
    },
  );

  app.post<{ Params: { id: string; tournamentMatchId: string } }>(
    '/api/tournaments/:id/matches/:tournamentMatchId/walkover',
    async (request) => {
      const admin = requireAdmin(request, config);
      const body = parse(walkoverSchema, request.body);
      return tournaments.walkover(request.params.id, request.params.tournamentMatchId, body.winnerId, admin.id);
    },
  );

  app.get('/api/admin/users', async (request) => {
    requireAdmin(request, config);
    const query = parse(adminUsersQuery, request.query);
    return { users: await tournaments.searchUsers(query.q, query.limit) };
  });
}
