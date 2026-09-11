import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, handleSchema, publicProfileResponseSchema } from '@pixelvault/contracts';
import { conquistasDesbloqueadasDoUsuario } from '../../achievements/index.js';
import { perfilPublicoPorHandle } from '../../identity/index.js';
import { agregadoDeJogoDoUsuario } from '../../progress/index.js';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { obterPerfilPublico } from '../application/obter-perfil-publico.js';

/**
 * Camada HTTP fina: valida, delega e serializa. Mesma disciplina de
 * `achievements`/`leaderboards` (`http/routes.ts` deles é o modelo).
 *
 * `perfilPublicoPorHandle` (de `identity`), `conquistasDesbloqueadasDoUsuario`
 * (de `achievements`) e `agregadoDeJogoDoUsuario` (de `progress`) são
 * importadas direto da fachada de cada um, e não injetadas pela composition
 * root: não há pergunta na direção contrária que fecharia ciclo (ver o
 * cabeçalho de `../domain/portas.ts`), então o padrão é o mesmo de
 * `leaderboards` importando `rankingDoJogo`/`posicaoDaContaNoRanking` de
 * `progress` e `perfisPublicosPorIds` de `identity`.
 */
export const profilesRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/profiles/:handle',
    {
      schema: {
        tags: ['profiles'],
        summary: 'O perfil público de uma conta — nome, conquistas e estatística agregada',
        description:
          'Sem sessão: é a camada social que o ADR 0006 menciona como razão de existir o ' +
          'game_id canônico. Nunca a biblioteca de ROMs (BYOR) nem o e-mail. Sem posição de ' +
          'ranking — ranking é por jogo (#122), não existe posição geral da conta. Handle ' +
          'inexistente responde 404, sem distinguir "não existe" de "existe mas é privado" ' +
          '(perfil não tem modo privado).',
        params: z.object({ handle: handleSchema }),
        response: { 200: publicProfileResponseSchema, 404: apiErrorSchema },
      },
    },
    async (request) => {
      const perfil = await obterPerfilPublico(
        {
          obterPerfilPorHandle: perfilPublicoPorHandle,
          obterConquistas: conquistasDesbloqueadasDoUsuario,
          obterAgregado: agregadoDeJogoDoUsuario,
        },
        request.params.handle,
      );
      if (perfil === null) throw new NotFoundError('Perfil');

      return {
        handle: perfil.handle,
        displayName: perfil.displayName,
        achievements: perfil.achievements.map((conquista) => ({
          code: conquista.code,
          unlockedAt: conquista.unlockedAt.toISOString(),
        })),
        totalPlaytimeSeconds: perfil.totalPlaytimeSeconds,
        distinctGamesCount: perfil.distinctGamesCount,
      };
    },
  );
};
