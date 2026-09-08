import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { UnauthenticatedError } from '../../../infrastructure/errors.js';
import { abrirSessao } from '../application/abrir-sessao.js';
import { listarSessoes, type SessaoListada } from '../application/listar-sessoes.js';
import { resolverSessao } from '../application/resolver-sessao.js';
import { revogarOutrasSessoes, revogarSessao } from '../application/revogar-sessoes.js';
import { prismaSessionRepository } from '../infrastructure/prisma-session-repository.js';
import { gerarTokenDeSessao, hashDoToken } from '../infrastructure/token-de-sessao.js';
import {
  NOME_DO_COOKIE_DE_SESSAO,
  opcoesDeLimpezaDoCookieDeSessao,
  opcoesDoCookieDeSessao,
} from './cookie.js';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Quem está autenticado nesta requisição, ou `null`. É a única coisa que
     * o resto da API precisa saber sobre sessão — nenhuma rota lê cookie.
     */
    userId: string | null;
    /**
     * Qual das sessões da pessoa é esta, ou `null`. Anda junto com `userId`:
     * os dois são preenchidos pelo mesmo hook, na mesma resolução.
     *
     * Existe porque "quem é você" não basta para duas operações desta issue:
     * "sair dos outros aparelhos" precisa saber qual não derrubar, e a
     * listagem precisa saber qual linha marcar como "este dispositivo". É o
     * id da linha em `sessions`, nunca o token — expor o token aqui o
     * colocaria ao alcance de qualquer handler.
     */
    sessionId: string | null;
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
   * Liga a resolução de sessão na aplicação inteira: decora `request.userId`
   * e `request.sessionId` e instala o hook que lê o cookie.
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
  /** O mesmo para `request.sessionId`. */
  sessaoAutenticada(request: FastifyRequest): string;
  /**
   * Encerra a sessão desta requisição e apaga o cookie. Silencioso quando não
   * havia sessão — ver `http/routes.ts` para o porquê de o logout não falhar.
   */
  encerrar(request: FastifyRequest, reply: FastifyReply): Promise<void>;
  /** As sessões vivas de quem está pedindo, com a atual marcada. */
  listar(request: FastifyRequest): Promise<SessaoListada[]>;
  /**
   * Revoga uma sessão do usuário desta requisição. `false` quando não havia o
   * que revogar — porque o id não existe OU porque é de outra pessoa, sem
   * distinção. Se o id revogado for o da sessão atual, o cookie é apagado
   * junto: deixá-lo no navegador só produziria um cookie que já não abre nada.
   */
  revogar(request: FastifyRequest, reply: FastifyReply, sessaoId: string): Promise<boolean>;
  /**
   * Derruba as outras sessões do usuário, preservando a atual. Devolve
   * quantas caíram. É o que `POST /api/auth/sessions/revoke-others` e a troca
   * de senha do `identity` chamam.
   */
  revogarOutras(request: FastifyRequest): Promise<number>;
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
 *
 * As rotas próprias do módulo (`/auth/logout`, `/auth/sessions`) são um
 * plugin à parte, em `http/routes.ts`, que recebe este objeto — elas são
 * rotas normais e não têm por que escapar do escopo.
 */
export function criarSessoes(opcoes: OpcoesDeSessoes): Sessoes {
  const agora = (): Date => new Date();
  const dependencias = { sessoes: prismaSessionRepository, hashDoToken, agora };

  function limparCookie(reply: FastifyReply): void {
    reply.clearCookie(
      NOME_DO_COOKIE_DE_SESSAO,
      opcoesDeLimpezaDoCookieDeSessao(opcoes.cookieSeguro),
    );
  }

  // Funções, e não `this.usuarioAutenticado(...)`: os métodos deste objeto
  // circulam soltos (`preHandler: sessoes.exigirSessao`), e método que depende
  // de `this` quebra no dia em que alguém desestruturar a interface.
  function usuarioAutenticado(request: FastifyRequest): string {
    if (request.userId === null) throw new UnauthenticatedError();
    return request.userId;
  }

  function sessaoAutenticada(request: FastifyRequest): string {
    if (request.sessionId === null) throw new UnauthenticatedError();
    return request.sessionId;
  }

  return {
    registrarEm(app: FastifyInstance): void {
      app.decorateRequest('userId', null);
      app.decorateRequest('sessionId', null);

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
        request.sessionId = resolvida.sessionId;

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

    usuarioAutenticado,

    sessaoAutenticada,

    async encerrar(request: FastifyRequest, reply: FastifyReply): Promise<void> {
      // O cookie some sempre, inclusive para quem chegou sem sessão viva:
      // o resultado que o cliente pediu é "não estou mais logado", e um
      // cookie órfão no navegador é a única forma de isso ficar meio feito.
      limparCookie(reply);

      if (request.userId === null || request.sessionId === null) return;
      await revogarSessao({ sessoes: prismaSessionRepository }, request.userId, request.sessionId);
    },

    async listar(request: FastifyRequest): Promise<SessaoListada[]> {
      return listarSessoes(
        { sessoes: prismaSessionRepository, agora },
        usuarioAutenticado(request),
        sessaoAutenticada(request),
      );
    },

    async revogar(
      request: FastifyRequest,
      reply: FastifyReply,
      sessaoId: string,
    ): Promise<boolean> {
      const revogada = await revogarSessao(
        { sessoes: prismaSessionRepository },
        usuarioAutenticado(request),
        sessaoId,
      );

      if (revogada && sessaoId === request.sessionId) limparCookie(reply);
      return revogada;
    },

    async revogarOutras(request: FastifyRequest): Promise<number> {
      return revogarOutrasSessoes(
        { sessoes: prismaSessionRepository },
        usuarioAutenticado(request),
        sessaoAutenticada(request),
      );
    },
  };
}
