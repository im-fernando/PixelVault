import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  leaderboardQuerySchema,
  leaderboardResponseSchema,
  uuidSchema,
} from '@pixelvault/contracts';
import {
  autorizarOuProibido,
  habilidadesDoUsuario,
  perfisPublicosPorIds,
} from '../../identity/index.js';
import { posicaoDaContaNoRanking, rankingDoJogo } from '../../progress/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { obterRankingDoJogo } from '../application/obter-ranking.js';

export interface OpcoesDeLeaderboards extends FastifyPluginOptions {
  /** Toda rota daqui exige sessão — a posição da própria conta pede saber quem pediu. */
  sessoes: Sessoes;
}

/**
 * Camada HTTP fina: valida, autoriza, delega e serializa. Mesma disciplina
 * de `achievements`/`progress` (`http/routes.ts` deles é o modelo).
 *
 * As duas funções de `progress` (`rankingDoJogo`, `posicaoDaContaNoRanking`)
 * e a de `identity` (`perfisPublicosPorIds`) são importadas direto da
 * fachada de cada um, e não injetadas pela composition root: não há
 * pergunta na direção contrária que fecharia ciclo (ver o cabeçalho de
 * `domain/portas.ts`), então o padrão é o mesmo de `library` importando
 * `descreverJogos` de `catalog`.
 */
export const leaderboardsRoutes: FastifyPluginAsyncZod<OpcoesDeLeaderboards> = async (
  app,
  opcoes,
) => {
  const { sessoes } = opcoes;

  app.get(
    '/leaderboards/games/:gameId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['leaderboards'],
        summary: 'Ranking de playtime de um jogo, com a posição da própria conta',
        description:
          'Ranking POR JOGO, não geral da conta — dado o BYOR (ADR 0006), só existe "o ' +
          'mesmo jogo" entre duas contas quando o catálogo reconhece o hash; somar ' +
          'playtime de jogos diferentes entre pessoas não seria uma comparação honesta. ' +
          'Total histórico, sem temporada (issue #122 decidiu não abrir essa peça sem ' +
          'infraestrutura de corte temporal). `top` traz as `limit` primeiras posições; ' +
          '`me` é a posição da própria conta, presente mesmo fora do `top` — `null` ' +
          'quando ela nunca creditou playtime nesse jogo (sem heartbeat aceito, ADR 0009).',
        params: z.object({ gameId: uuidSchema }),
        querystring: leaderboardQuerySchema,
        response: { 200: leaderboardResponseSchema, 401: apiErrorSchema, 403: apiErrorSchema },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      autorizarOuProibido(await habilidadesDoUsuario(userId), 'read', 'Leaderboard');

      const resultado = await obterRankingDoJogo(
        {
          obterRanking: rankingDoJogo,
          obterPosicaoDaConta: posicaoDaContaNoRanking,
          obterPerfis: perfisPublicosPorIds,
        },
        request.params.gameId,
        userId,
        request.query.limit,
      );

      return {
        gameId: resultado.gameId,
        top: resultado.top.map((linha) => ({
          userId: linha.userId,
          handle: linha.handle,
          displayName: linha.displayName,
          totalPlaytimeSeconds: linha.totalPlaytimeSeconds,
          rank: linha.posicao,
        })),
        me:
          resultado.minhaPosicao === null
            ? null
            : {
                userId: resultado.minhaPosicao.userId,
                handle: resultado.minhaPosicao.handle,
                displayName: resultado.minhaPosicao.displayName,
                totalPlaytimeSeconds: resultado.minhaPosicao.totalPlaytimeSeconds,
                rank: resultado.minhaPosicao.posicao,
              },
      };
    },
  );
};
