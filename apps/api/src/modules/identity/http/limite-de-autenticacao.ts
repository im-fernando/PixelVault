import type {
  FastifyReply,
  FastifyRequest,
  onSendHookHandler,
  preValidationHookHandler,
} from 'fastify';
import { RateLimitedError } from '../../../infrastructure/errors.js';
import {
  esquecerTentativas,
  registrarTentativa,
  verificarTentativas,
  type DependenciasDeTentativas,
  type EstadoDoLimite,
  type TentativaEmCurso,
} from '../application/controlar-tentativas.js';
import { Email } from '../domain/email.js';
import type { EscopoDeTentativa } from '../domain/limite-de-tentativas.js';
import { chaveDeTentativa } from '../infrastructure/chave-de-tentativa.js';
import { prismaTentativaRepository } from '../infrastructure/prisma-tentativa-repository.js';

export interface OpcoesDoLimiteDeAutenticacao {
  /**
   * Segredo do HMAC que mascara IP e identificador na tabela. É o mesmo
   * `SESSION_SECRET` da aplicação — ver `infrastructure/chave-de-tentativa.ts`.
   */
  segredo: string;
}

/** Os dois ganchos que uma rota protegida precisa declarar. */
export interface GanchosDeLimite {
  preValidation: preValidationHookHandler;
  onSend: onSendHookHandler;
}

export interface LimitesDeAutenticacao {
  login: GanchosDeLimite;
  cadastro: GanchosDeLimite;
  trocaDeSenha: GanchosDeLimite;
}

/** O que o `onSend` precisa lembrar do que o `preValidation` já fez. */
interface RastroDaTentativa {
  registro: TentativaEmCurso;
  /** O identificador em claro, só para o log de tentativa recusada. */
  identificador: string | null;
}

/**
 * O rate limit das rotas de credencial.
 *
 * Não é `@fastify/rate-limit`. O plugin resolve muito bem o caso para o qual
 * foi feito — um contador, uma chave, um teto — e é exatamente isso que ele
 * faz no teto global da API, em `app.ts`. Aqui são dois contadores por
 * requisição, com janelas diferentes, chaves de origens diferentes (uma vem
 * do socket, a outra do corpo ainda não validado), bloqueio que dobra e um
 * "esqueça o que aconteceu" no sucesso. Espremer isso no `store` customizado
 * do plugin, que é síncrono por chave e não conhece o resultado da rota,
 * daria mais código e menos clareza do que os dois ganchos abaixo.
 *
 * O ponto de acoplamento é `preValidation`, e não `preHandler`: o corpo já
 * está parseado (precisamos do e-mail) mas o schema ainda não rodou, então
 * requisição malformada também conta contra o IP. Se contasse só o que passa
 * na validação, um corpo lixo seria uma requisição de graça — e mil delas,
 * um flood de graça.
 */
export function criarLimitesDeAutenticacao(
  opcoes: OpcoesDoLimiteDeAutenticacao,
): LimitesDeAutenticacao {
  const deps: DependenciasDeTentativas = {
    tentativas: prismaTentativaRepository,
    agora: () => new Date(),
  };

  // WeakMap em vez de decorar a request: o estado vale de um gancho ao outro
  // dentro da mesma requisição e não interessa a mais ninguém — decorar
  // colocaria isso ao alcance de qualquer handler da aplicação.
  const emCurso = new WeakMap<FastifyRequest, RastroDaTentativa>();

  function proteger(
    escopo: EscopoDeTentativa,
    extrairIdentificador: (request: FastifyRequest) => string | null,
    esquecerNoSucesso: boolean,
  ): GanchosDeLimite {
    const preValidation: preValidationHookHandler = async (request, reply) => {
      const identificador = extrairIdentificador(request);
      const chaves = {
        ip: chaveDeTentativa(opcoes.segredo, request.ip),
        identificador:
          identificador === null ? null : chaveDeTentativa(opcoes.segredo, identificador),
      };

      // Falha do contador derruba a requisição, não a libera. Se o
      // PostgreSQL não responde, o login não teria como funcionar de
      // qualquer forma — as contas estão nele.
      const estado = await verificarTentativas(deps, escopo, chaves);
      aplicarCabecalhos(reply, estado);

      if (estado.bloqueado) {
        reply.header('retry-after', String(segundosAte(estado.liberadoEm)));
        registrarNoLog(request, escopo, identificador, 'limite-estourado');
        throw new RateLimitedError(estado.motivo ?? 'LIMITE_POR_IP');
      }

      const registro = await registrarTentativa(deps, escopo, chaves);
      emCurso.set(request, { registro, identificador });
    };

    const onSend: onSendHookHandler = async (request, reply, payload) => {
      const tentativa = emCurso.get(request);
      if (tentativa === undefined) return payload;
      emCurso.delete(request);

      try {
        if (reply.statusCode >= 400) {
          registrarNoLog(request, escopo, tentativa.identificador, String(reply.statusCode));
        } else if (esquecerNoSucesso) {
          await esquecerTentativas(deps, escopo, tentativa.registro);
        }
      } catch (erro) {
        // Nada aqui pode desfazer o que a rota já decidiu: um erro ao limpar
        // o contador viraria 500 em cima de um login que deu certo.
        request.log.error({ err: erro }, 'falha ao encerrar o contador de tentativas');
      }

      return payload;
    };

    return { preValidation, onSend };
  }

  return {
    login: proteger('login', emailDoCorpo, true),
    // Cadastro nunca esquece: ele responde igual para conta criada e para
    // e-mail repetido, então não existe "sucesso" observável que autorize
    // zerar contador nenhum. Ver `application/registrar-usuario.ts`.
    cadastro: proteger('register', emailDoCorpo, false),
    trocaDeSenha: proteger('change_password', (request) => request.userId, true),
  };
}

/**
 * O e-mail que está sendo tentado, normalizado como o banco o guarda — mesmo
 * quando não é um e-mail válido, porque a validação ainda não rodou e um
 * texto qualquer também precisa cair num balde estável.
 */
function emailDoCorpo(request: FastifyRequest): string | null {
  const corpo: unknown = request.body;
  if (typeof corpo !== 'object' || corpo === null) return null;

  const email = (corpo as Record<string, unknown>)['email'];
  return typeof email === 'string' ? Email.chaveDeBusca(email) : null;
}

/**
 * `ratelimit-*` (o nome do rascunho de padrão da IETF, sem o `x-`) e não
 * `x-ratelimit-*`: o segundo já é do teto global de requisições, aplicado
 * pelo `@fastify/rate-limit` em `app.ts`. São dois limites de verdade, com
 * contas diferentes, e usar o mesmo nome faria um sobrescrever o outro na
 * mesma resposta.
 */
function aplicarCabecalhos(reply: FastifyReply, estado: EstadoDoLimite): void {
  reply.header('ratelimit-limit', String(estado.limite));
  reply.header('ratelimit-remaining', String(estado.restantes));
  reply.header('ratelimit-reset', String(segundosAte(estado.liberadoEm)));
}

function segundosAte(momento: Date): number {
  return Math.max(1, Math.ceil((momento.getTime() - Date.now()) / 1000));
}

/**
 * O registro que sustenta uma investigação: quando, de onde, contra qual
 * identificador e o que aconteceu.
 *
 * O que **nunca** entra: a senha tentada. Ela não é passada para esta função
 * e o corpo da requisição não é logado em lugar nenhum da aplicação — o
 * logger ainda redige `password` por precaução, em `app.ts`, para o caso de
 * alguém pendurar um objeto inteiro num log futuro.
 *
 * O e-mail vai em claro aqui, e mascarado na tabela `auth_attempts`, de
 * propósito: log é operacional, tem retenção curta e só existe para quem
 * está investigando um incidente; a tabela é durável e não deve virar, com o
 * tempo, a lista de quem foi alvo.
 */
function registrarNoLog(
  request: FastifyRequest,
  escopo: EscopoDeTentativa,
  identificador: string | null,
  resultado: string,
): void {
  request.log.warn(
    {
      evento: 'auth.tentativa-recusada',
      escopo,
      resultado,
      ip: request.ip,
      identificador,
    },
    'tentativa de autenticação recusada',
  );
}
