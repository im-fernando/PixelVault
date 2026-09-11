import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { apiErrorSchema, handleSchema, publicProfileResponseSchema } from '@pixelvault/contracts';
import { conquistasDesbloqueadasDoUsuario } from '../modules/achievements/index.js';
import { perfilPublicoPorHandle } from '../modules/identity/index.js';
import { agregadoDeJogoDoUsuario } from '../modules/progress/index.js';
import { NotFoundError } from '../infrastructure/errors.js';

/**
 * `GET /api/profiles/:handle` — o perfil público da M6 (issue #123).
 *
 * ## Por que esta rota não mora dentro de `identity`, `achievements` nem
 * `progress`
 *
 * O perfil público PERGUNTA aos três: `identity` resolve o handle da URL
 * para uma conta, `achievements` diz quais conquistas ela já desbloqueou,
 * `progress` diz o playtime e os jogos distintos agregados. Nenhum dos três
 * pode ser o dono da pergunta sem quebrar a fronteira em algum sentido:
 *
 * - `identity` não pode importar `achievements` nem `progress` — os dois já
 *   importam `identity` (para `autorizarOuNaoEncontrado`/`habilidadesDoUsuario`),
 *   e a direção contrária fecharia um ciclo real entre módulos, que o
 *   `dependency-cruiser` (`sem-ciclos`) reprova. Ver docs/adr/0003.
 * - `achievements` já pergunta a `progress` (via `agregadoDeJogoDoUsuario`),
 *   mas só porque a composition root injeta a resposta por `opcoes` — a
 *   importação direta fecharia ciclo com o aviso de evento que `progress`
 *   já faz na direção contrária (`avisarPrimeiroSaveState` e companhia). Dar
 *   a esta rota nova a MESMA função injetada por `opcoes` funcionaria, mas
 *   emprestaria a `achievements` uma responsabilidade (agregar perfil
 *   público) que não é dele — acabaria parecendo que o módulo de conquistas
 *   é o dono do perfil.
 *
 * Um módulo novo só para isto seria exagero: não há regra de negócio, dado
 * próprio nem tabela — é leitura pura de três fachadas já prontas. Por isso
 * a agregação mora aqui, na composition root (`apps/api/src/http/`, fora de
 * `modules/`): o mesmo lugar que já injeta `contarRomsNaBiblioteca` e
 * `agregadoDeJogoDoUsuario` em `achievementsRoutes` (`app.ts`) já sabe montar
 * os três facades sem fechar ciclo nenhum, porque nada importa DESTE
 * arquivo — só ele importa dos módulos.
 *
 * ## Decisão: sem posição de ranking no perfil
 *
 * A #122 decidiu ranking POR JOGO, não geral da conta (ver o cabeçalho de
 * `modules/leaderboards/index.ts`) — não existe "a posição desta pessoa" sem
 * dizer em qual jogo. Sintetizar uma posição geral inventaria um conceito
 * que a #122 decidiu não ter. O perfil mostra playtime e jogos distintos
 * agregados (o mesmo raciocínio de `agregadoDeJogoDoUsuario` em
 * `achievements`), e quem quiser a posição num jogo específico já tem
 * `GET /api/leaderboards/games/:gameId`.
 *
 * ## Sem sessão, sem CASL
 *
 * Mesmo padrão do catálogo público (`catalogRoutes`, `GET /games/:slug`):
 * dado público não pede pergunta de autorização — não há regra de
 * `Profile` público em `habilidades.ts`, porque não há nada a negar aqui.
 * O que a issue pede para nunca vazar (a biblioteca de ROMs) simplesmente
 * não faz parte da resposta.
 */
export const perfilPublicoRoutes: FastifyPluginAsyncZod = async (app) => {
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
      const perfil = await perfilPublicoPorHandle(request.params.handle);
      if (perfil === null) throw new NotFoundError('Perfil');

      const [conquistas, agregado] = await Promise.all([
        conquistasDesbloqueadasDoUsuario(perfil.userId),
        agregadoDeJogoDoUsuario(perfil.userId),
      ]);

      return {
        handle: perfil.handle,
        displayName: perfil.displayName,
        achievements: conquistas.map((conquista) => ({
          code: conquista.code,
          unlockedAt: conquista.unlockedAt.toISOString(),
        })),
        totalPlaytimeSeconds: agregado.segundosJogados,
        distinctGamesCount: agregado.jogosDistintos,
      };
    },
  );
};
