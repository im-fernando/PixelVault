import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UnauthenticatedError } from '../../../infrastructure/errors.js';
import { abrirSessao } from '../application/abrir-sessao.js';
import { resolverSessao } from '../application/resolver-sessao.js';
import { prismaSessionRepository } from '../infrastructure/prisma-session-repository.js';
import { gerarTokenDeSessao, hashDoToken } from '../infrastructure/token-de-sessao.js';
import { NOME_DO_COOKIE_DE_SESSAO, opcoesDoCookieDeSessao } from './cookie.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Quem está autenticado nesta requisição, ou `null`. É a única coisa que
     * o resto da API precisa saber sobre sessão — nenhuma rota lê cookie.
     */
    userId: string | null;
  }
}

export interface OpcoesDeSessoes {
  /**
   * `Secure` no cookie. Falso só em desenvolvimento, onde o front fala com
   * `http://localhost` e um cookie `Secure` simplesmente não voltaria.
   */
  cookieSeguro: boolean;
}

export interface Sessoes {
  /**
   * Liga a resolução de sessão na aplicação inteira: decora
   * `request.userId` e instala o hook que lê o cookie.
   */
  registrarEm(app: FastifyInstance): void;
  /** Abre sessão nova para `userId` e escreve o cookie na resposta. */
  abrir(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void>;
  /** `preHandler` para rotas que só existem para quem está logado. */
  exigirSessao(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  /**
   * O mesmo `request.userId`, já estreitado para `string`. Existe para o
   * handler não precisar repetir a checagem que o `preHandler` fez nem
   * inventar um `?? ''` para calar o compilador.
   */
  usuarioAutenticado(request: FastifyRequest): string;
}

/**
 * Composition root do `sessions`.
 *
 * O módulo entrega um objeto, não um plugin registrado por `app.register`,
 * por um motivo prático: `decorateRequest` e `addHook` precisam valer para
 * o app inteiro, e um plugin registrado sem `fastify-plugin` fica preso no
 * próprio escopo — as rotas dos outros módulos não enxergariam
 * `request.userId`. Chamar `registrarEm(app)` na raiz é o mesmo caminho que
 * `registerErrorHandler` já usa neste projeto, e deixa a dependência
 * explícita em `app.ts` em vez de escondida numa decoração mágica.
 */
export function criarSessoes(opcoes: OpcoesDeSessoes): Sessoes {
  const agora = (): Date => new Date();
  const dependencias = { sessoes: prismaSessionRepository, hashDoToken, agora };

  return {
    registrarEm(app: FastifyInstance): void {
      app.decorateRequest('userId', null);

      // `onRequest`, o mais cedo possível: qualquer hook ou rota registrado
      // depois já encontra `request.userId` preenchido.
      app.addHook('onRequest', async (request, reply) => {
        const assinado = request.cookies[NOME_DO_COOKIE_DE_SESSAO];
        // Sem cookie não há consulta ao banco: rota pública continua
        // custando o que custava.
        if (assinado === undefined) return;

        const token = request.unsignCookie(assinado);
        if (!token.valid || token.value === null) return;

        const resolvida = await resolverSessao(dependencias, token.value);
        if (resolvida === null) return;

        request.userId = resolvida.userId;

        // A sessão deslizou no servidor; o cookie precisa deslizar junto.
        if (resolvida.renovadaAte !== undefined) {
          reply.setCookie(
            NOME_DO_COOKIE_DE_SESSAO,
            token.value,
            opcoesDoCookieDeSessao(opcoes.cookieSeguro, resolvida.renovadaAte),
          );
        }
      });
    },

    async abrir(request: FastifyRequest, reply: FastifyReply, userId: string): Promise<void> {
      const { token, expiresAt } = await abrirSessao(
        { sessoes: prismaSessionRepository, gerarToken: gerarTokenDeSessao, hashDoToken, agora },
        userId,
        { userAgent: request.headers['user-agent'] ?? null, ip: request.ip },
      );

      reply.setCookie(
        NOME_DO_COOKIE_DE_SESSAO,
        token,
        opcoesDoCookieDeSessao(opcoes.cookieSeguro, expiresAt),
      );
    },

    async exigirSessao(request: FastifyRequest, _reply: FastifyReply): Promise<void> {
      // Sessão ausente, adulterada ou expirada chegam aqui do mesmo jeito:
      // `userId` nulo. 401 — nunca 500, e nunca uma pista de qual dos três foi.
      if (request.userId === null) throw new UnauthenticatedError();
    },

    usuarioAutenticado(request: FastifyRequest): string {
      if (request.userId === null) throw new UnauthenticatedError();
      return request.userId;
    },
  };
}
