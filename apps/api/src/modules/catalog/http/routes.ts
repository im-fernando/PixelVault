import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  buscarCapasCandidatasQuerySchema,
  buscarCapasCandidatasResponseSchema,
  gameDetailSchema,
  gameListQuerySchema,
  gameSchema,
  identificarCapaRequestSchema,
  identificarCapaResponseSchema,
  slugSchema,
  uuidSchema,
} from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import type { Sessoes } from '../../sessions/index.js';
import { buscarCapasCandidatas } from '../application/buscar-capas-candidatas.js';
import { getGameBySlug } from '../application/get-game.js';
import { identificarCapaManual } from '../application/identificar-capa-manual.js';
import { listGames } from '../application/list-games.js';
import { criarBuscaDeCapaPorNomeNoLibretro } from '../infrastructure/capa-libretro-thumbnails-por-nome.js';
import { criarBuscaDeCapa } from '../infrastructure/criar-busca-de-capa.js';
import { prismaGameRepository } from '../infrastructure/prisma-game-repository.js';

export interface OpcoesDoCatalogo extends FastifyPluginOptions {
  /**
   * O módulo `sessions`, injetado pela composition root: identificar capa
   * manualmente exige sessão — não é leitura pública como o resto deste
   * módulo, é uma escrita em `games.cover_url` que qualquer conta pode
   * disparar.
   */
  sessoes: Sessoes;
}

/** Instância própria, como `identificar-rom.ts` faz com a dela: o cache de ausência vive aqui. */
const buscaDeCapa = criarBuscaDeCapa();

/** O cache da lista de nomes por sistema vive aqui — uma chamada à Trees API por console, por dia. */
const buscaDeCapaPorNome = criarBuscaDeCapaPorNomeNoLibretro();

/**
 * Camada HTTP fina: valida, delega ao caso de uso e serializa. Nenhuma regra
 * de negócio mora aqui.
 */
export const catalogRoutes: FastifyPluginAsyncZod<OpcoesDoCatalogo> = async (app, opcoes) => {
  const { sessoes } = opcoes;
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
        summary: 'Detalhe de um jogo do catálogo, com a ROM quando é homebrew',
        params: z.object({ slug: slugSchema }),
        response: { 200: gameDetailSchema, 404: apiErrorSchema },
      },
    },
    async (request) => getGameBySlug(repository, request.params.slug),
  );

  app.post(
    '/games/:gameId/cover',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['catalog'],
        summary: 'Procura a capa de um jogo por um nome digitado',
        description:
          'A busca automática (#77) tenta o título do catálogo contra uma lista curta de ' +
          'sufixos de região, e não acha quando o arquivo do provedor carrega um sufixo ' +
          'fora dessa lista — região e idioma juntos, por exemplo. Esta rota tenta o ' +
          'título exato que a pessoa digitou. Responde 200 com `nao-encontrada` quando o ' +
          'nome também não bate com nada — não é erro, é a mesma resposta honesta da ' +
          'busca automática. Jogo que já tem capa, é homebrew (ADR 0016) ou não existe dá ' +
          '404, sem distinguir os três: nenhum deles tem o que este endpoint faria.',
        params: z.object({ gameId: uuidSchema }),
        body: identificarCapaRequestSchema,
        response: {
          200: identificarCapaResponseSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      sessoes.usuarioAutenticado(request);

      const resultado = await identificarCapaManual(
        { jogos: repository, busca: buscaDeCapa },
        request.params.gameId,
        request.body.title,
      );

      switch (resultado.tipo) {
        case 'encontrada':
          return reply
            .status(200)
            .send({ status: 'encontrada' as const, coverUrl: resultado.coverUrl });
        case 'naoEncontrada':
          return reply.status(200).send({ status: 'nao-encontrada' as const });
        case 'semOQueProcurar':
          throw new NotFoundError('Jogo');
      }
    },
  );

  app.get(
    '/games/:gameId/cover/search',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['catalog'],
        summary: 'Lista capas do provedor cujo nome contém o trecho digitado',
        description:
          'É o que alimenta a busca manual antes de a pessoa confirmar um nome em ' +
          '`POST .../cover`: em vez de exigir o nome exato do dump, digita um trecho e ' +
          'escolhe de uma lista de nomes que o provedor tem de verdade. A primeira busca ' +
          'de cada console baixa a lista completa dele (a Trees API do GitHub, não o ' +
          'servidor de thumbnails — que só serve arquivo estático); as próximas usam o ' +
          'cache de até 24h. Lista vazia é resposta normal — o trecho pode não estar em ' +
          'nome nenhum. Jogo que já tem capa, é homebrew (ADR 0016) ou não existe dá 404.',
        params: z.object({ gameId: uuidSchema }),
        querystring: buscarCapasCandidatasQuerySchema,
        response: {
          200: buscarCapasCandidatasResponseSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      sessoes.usuarioAutenticado(request);

      const resultado = await buscarCapasCandidatas(
        { jogos: repository, buscarCandidatas: buscaDeCapaPorNome },
        request.params.gameId,
        request.query.q,
      );

      if (resultado.tipo === 'semOQueProcurar') throw new NotFoundError('Jogo');
      return { candidatas: [...resultado.itens] };
    },
  );
};
