import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, gameListQuerySchema, gameSchema, slugSchema } from '@pixelvault/contracts';
import { getGameBySlug } from '../application/get-game.js';
import { listGames } from '../application/list-games.js';
import { prismaGameRepository } from '../infrastructure/prisma-game-repository.js';

/**
 * Camada HTTP fina: valida, delega ao caso de uso e serializa. Nenhuma regra
 * de negócio mora aqui.
 */
export const catalogRoutes: FastifyPluginAsyncZod = async (app) => {
  const repository = prismaGameRepository;

  app.get(
    '/games',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Lista jogos do catálogo',
        querystring: gameListQuerySchema,
        response: { 200: z.array(gameSchema) },
      },
    },
    async (request) => listGames(repository, request.query),
  );

  app.get(
    '/games/:slug',
    {
      schema: {
        tags: ['catalog'],
        summary: 'Detalhe de um jogo do catálogo',
        params: z.object({ slug: slugSchema }),
        response: { 200: gameSchema, 404: apiErrorSchema },
      },
    },
    async (request) => getGameBySlug(repository, request.params.slug),
  );
};
