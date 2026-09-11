import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { achievementListResponseSchema, apiErrorSchema } from '@pixelvault/contracts';
import {
  autorizarOuProibido,
  habilidadesDoUsuario,
  recurso,
  type Acao,
} from '../../identity/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { listarConquistas } from '../application/listar-conquistas.js';
import type {
  ContarRomsNaBiblioteca,
  ObterAgregadoDeJogoDoUsuario,
} from '../domain/portas-de-agregacao.js';
import { prismaConquistaDesbloqueadaRepository } from '../infrastructure/prisma-conquista-desbloqueada-repository.js';

export interface OpcoesDeAchievements extends FastifyPluginOptions {
  /** Toda rota daqui exige sessão — a conquista é da conta, nunca do visitante. */
  sessoes: Sessoes;
  /**
   * Injetadas pela composition root, e não importadas direto da fachada de
   * `library`/`progress` aqui: ver o cabeçalho de
   * `domain/portas-de-agregacao.ts` para o porquê (evitar o ciclo entre
   * módulos que o import direto nos dois sentidos criaria).
   */
  contarRomsNaBiblioteca: ContarRomsNaBiblioteca;
  agregadoDeJogoDoUsuario: ObterAgregadoDeJogoDoUsuario;
}

/**
 * Camada HTTP fina: valida, autoriza, delega e serializa. Mesma disciplina
 * de `library`/`progress` (`http/routes.ts` deles é o modelo).
 */
export const achievementsRoutes: FastifyPluginAsyncZod<OpcoesDeAchievements> = async (
  app,
  opcoes,
) => {
  const { sessoes, contarRomsNaBiblioteca, agregadoDeJogoDoUsuario } = opcoes;

  async function exigirPoderSobreAsPropriasConquistas(userId: string, acao: Acao): Promise<void> {
    autorizarOuProibido(
      await habilidadesDoUsuario(userId),
      acao,
      recurso('Achievement', { userId }),
    );
  }

  app.get(
    '/achievements',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['achievements'],
        summary: 'As conquistas de plataforma que a própria conta já desbloqueou',
        description:
          'Conquista de evento (primeira ROM enviada, primeiro save state, primeira ' +
          'sincronização) já está persistida quando aparece aqui. Conquista por agregação ' +
          '(coleção, jogos distintos, horas jogadas) é verificada nesta mesma chamada, contra ' +
          'o estado real da conta (docs/adr/0010) — não existe atraso entre bater o número e ' +
          'a conquista aparecer na lista. Conquista não desbloqueada simplesmente não aparece; ' +
          'não há um item "bloqueada" na resposta.',
        response: { 200: achievementListResponseSchema, 401: apiErrorSchema, 403: apiErrorSchema },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderSobreAsPropriasConquistas(userId, 'read');

      return listarConquistas(
        {
          conquistas: prismaConquistaDesbloqueadaRepository,
          contarRomsNaBiblioteca,
          agregadoDeJogoDoUsuario,
        },
        userId,
      );
    },
  );
};
