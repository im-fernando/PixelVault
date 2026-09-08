import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  logoutResponseSchema,
  revokeOtherSessionsResponseSchema,
  revokeSessionResponseSchema,
  sessionListResponseSchema,
  uuidSchema,
  type SessionSummary,
} from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import type { SessaoListada } from '../application/listar-sessoes.js';
import type { Sessoes } from './sessoes.js';

export interface OpcoesDeSessionsRoutes extends FastifyPluginOptions {
  /** O próprio módulo, montado pela composition root em `app.ts`. */
  sessoes: Sessoes;
}

/**
 * As rotas de sessão vivem aqui, e não no `identity`, embora a URL comece com
 * `/auth`: quem é dono do ciclo de vida da sessão é este módulo. O `identity`
 * cuida de credencial — e-mail, senha, quem é você. Se a listagem e a
 * revogação morassem lá, `identity` precisaria conhecer o formato de uma
 * sessão para serializá-la, que é exatamente a fronteira que a ADR 0003
 * protege.
 *
 * Camada fina como as outras: valida, delega ao caso de uso e serializa.
 */
export const sessionsRoutes: FastifyPluginAsyncZod<OpcoesDeSessionsRoutes> = async (
  app,
  opcoes,
) => {
  const { sessoes } = opcoes;

  app.post(
    '/auth/logout',
    {
      schema: {
        tags: ['sessions'],
        summary: 'Encerra a sessão atual',
        description:
          'Sempre 200, com ou sem sessão válida no cookie. Logout é a única operação ' +
          'em que o estado desejado pelo cliente já vale quando ele chega: quem pede ' +
          'para sair e já estava fora conseguiu o que queria. Um 401 aqui obrigaria o ' +
          'front a tratar um erro que não tem tratamento — e, pior, o levaria a não ' +
          'apagar o cookie num caso em que o cookie precisa ir embora de qualquer jeito.',
        response: { 200: logoutResponseSchema },
      },
    },
    async (request, reply) => {
      await sessoes.encerrar(request, reply);
      return reply.status(200).send({ status: 'sessao-encerrada' as const });
    },
  );

  app.get(
    '/auth/sessions',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['sessions'],
        summary: 'Onde a pessoa está logada',
        description:
          'Dispositivo aproximado (user-agent e IP truncado), quando a sessão nasceu e ' +
          'quando foi usada pela última vez, com a sessão atual marcada. Nunca devolve ' +
          'o token nem o hash dele. Sessões vencidas são podadas antes de listar.',
        response: { 200: sessionListResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request) => ({ sessions: (await sessoes.listar(request)).map(serializar) }),
  );

  // Antes da rota com parâmetro por clareza de leitura; os métodos já são
  // diferentes (POST x DELETE), então não há ambiguidade de roteamento.
  app.post(
    '/auth/sessions/revoke-others',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['sessions'],
        summary: 'Sair de todos os outros aparelhos',
        description:
          'Derruba todas as sessões da conta menos a que fez a chamada. Quem clica ' +
          'nisso está no dispositivo em que confia e quer expulsar os outros — ' +
          'autodeslogar seria o oposto do pedido.',
        response: { 200: revokeOtherSessionsResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request) => ({
      status: 'sessoes-revogadas' as const,
      revoked: await sessoes.revogarOutras(request),
    }),
  );

  app.delete(
    '/auth/sessions/:id',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['sessions'],
        summary: 'Revoga uma sessão da própria conta',
        description:
          'Responde 404 tanto para id inexistente quanto para sessão de outra pessoa — ' +
          'um 403 no segundo caso confirmaria que aquele id existe, e quem varre ids ' +
          'de sessão alheia não deveria conseguir arrancar nem essa informação. ' +
          'Revogar a própria sessão atual é permitido e equivale a um logout.',
        params: z.object({ id: uuidSchema }),
        response: { 200: revokeSessionResponseSchema, 401: apiErrorSchema, 404: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const revogada = await sessoes.revogar(request, reply, request.params.id);
      // Uma resposta só para os dois casos, e ela vem de um booleano: não há
      // aqui a informação "existe mas é de outro" nem para vazar por engano.
      if (!revogada) throw new NotFoundError('Sessão');

      return reply.status(200).send({ status: 'sessao-revogada' as const });
    },
  );
};

/**
 * Domínio fala `Date` e português; o contrato fala ISO-8601 e inglês. A
 * tradução é da borda — é para isso que a camada `http/` existe.
 */
function serializar(sessao: SessaoListada): SessionSummary {
  return {
    id: sessao.id,
    userAgent: sessao.userAgent,
    ipTruncated: sessao.ipTruncated,
    createdAt: sessao.createdAt.toISOString(),
    lastSeenAt: sessao.lastSeenAt.toISOString(),
    current: sessao.atual,
  };
}
