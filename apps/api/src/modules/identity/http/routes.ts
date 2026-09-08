import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  authenticatedUserResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
} from '@pixelvault/contracts';
import { DomainError } from '../../../infrastructure/errors.js';
import type { Sessoes } from '../../sessions/index.js';
import { autenticarUsuario } from '../application/autenticar-usuario.js';
import { buscarUsuarioAutenticado } from '../application/buscar-usuario-autenticado.js';
import { registrarUsuario } from '../application/registrar-usuario.js';
import { trocarSenha } from '../application/trocar-senha.js';
import {
  gerarHashDeSenha,
  HASH_DESCARTAVEL,
  verificarERehash,
  verificarSenha,
} from '../infrastructure/hash-de-senha.js';
import { prismaUserRepository } from '../infrastructure/prisma-user-repository.js';

/**
 * Teto provisório por IP no cadastro. Cinco tentativas em dez minutos é
 * generoso para quem está criando a própria conta e estreito para quem está
 * varrendo e-mails — e o hash Argon2id de cada tentativa custa caro no
 * servidor, então deixar a rota nua também seria um vetor de negação de
 * serviço.
 *
 * Isto é primeira linha, não a defesa: rate limit de verdade (por rota, por
 * conta, com armazenamento compartilhado entre instâncias e resposta a
 * força bruta) é a issue #49, que deve revisar estes números e provavelmente
 * mover a configuração para fora daqui. Em memória, o contador não sobrevive
 * a restart nem é compartilhado entre processos.
 *
 * O login fica de fora deste teto de propósito: limitar tentativa de senha
 * é o trabalho da #49, com contagem por conta além de por IP. Um limite por
 * IP colado aqui daria a impressão de que o problema está resolvido.
 */
const LIMITE_DE_CADASTRO = { max: 5, timeWindow: '10 minutes' } as const;

export interface OpcoesDeIdentity extends FastifyPluginOptions {
  /**
   * O módulo `sessions`, injetado pela composition root. `identity` sabe
   * conferir credencial; abrir e resolver sessão é do outro lado da
   * fronteira, e a única coisa que atravessa é esta interface.
   */
  sessoes: Sessoes;
}

/**
 * Camada HTTP fina: valida, delega ao caso de uso e serializa. Nenhuma regra
 * de negócio mora aqui — inclusive a decisão de responder igual para e-mail
 * duplicado e a de responder igual para e-mail inexistente e senha errada,
 * que são dos casos de uso.
 */
export const identityRoutes: FastifyPluginAsyncZod<OpcoesDeIdentity> = async (app, opcoes) => {
  const { sessoes } = opcoes;

  await app.register(rateLimit, {
    global: false,
    // O plugin lança o que este builder devolver; devolvendo um DomainError,
    // a resposta 429 sai pelo mesmo tradutor de erro de todo o resto e chega
    // ao cliente no formato `ApiError`, com requestId.
    errorResponseBuilder: () =>
      new DomainError('RATE_LIMITED', 'Tentativas demais. Tente de novo em alguns minutos.', 429),
  });

  app.post(
    '/auth/register',
    {
      config: { rateLimit: LIMITE_DE_CADASTRO },
      schema: {
        tags: ['identity'],
        summary: 'Cria uma conta',
        description:
          'Responde igual para conta criada e para e-mail já cadastrado — cadastro não ' +
          'pode servir de oráculo para descobrir quem tem conta.',
        body: registerRequestSchema,
        response: {
          202: registerResponseSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await registrarUsuario(
        { usuarios: prismaUserRepository, gerarHash: gerarHashDeSenha },
        request.body,
      );

      // 202, e não 201: "Created" seria mentira no caminho em que o e-mail já
      // existia e nada foi criado — e um status que muda conforme o caso é
      // exatamente o vazamento que este endpoint precisa evitar.
      return reply.status(202).send({ status: 'cadastro-recebido' });
    },
  );

  app.post(
    '/auth/login',
    {
      schema: {
        tags: ['identity'],
        summary: 'Autentica e abre sessão',
        description:
          'E-mail inexistente e senha errada produzem a mesma resposta, com o mesmo ' +
          'custo de tempo. Em caso de sucesso, a sessão vai num cookie httpOnly — o ' +
          'token nunca aparece no corpo.',
        body: loginRequestSchema,
        response: { 200: authenticatedUserResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const usuario = await autenticarUsuario(
        {
          usuarios: prismaUserRepository,
          verificar: verificarERehash,
          hashDescartavel: HASH_DESCARTAVEL,
        },
        request.body,
      );

      // Sessão nova a cada login, sempre. Nada é reaproveitado, então não há
      // identificador pré-existente para um atacante fixar. Ver docs/adr/0017.
      await sessoes.abrir(request, reply, usuario.id);

      return reply.status(200).send({ user: usuario });
    },
  );

  app.get(
    '/auth/me',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['identity'],
        summary: 'Quem está logado',
        description:
          'Sessão ausente, inválida ou expirada respondem 401 — nunca 500. Passar por ' +
          'aqui também desliza a validade da sessão quando resta menos da metade do prazo.',
        response: { 200: authenticatedUserResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request) => {
      // Duas peças com papéis diferentes: `exigirSessao` recusa antes de o
      // handler rodar, `usuarioAutenticado` entrega o id já como `string`.
      const usuario = await buscarUsuarioAutenticado(
        prismaUserRepository,
        sessoes.usuarioAutenticado(request),
      );
      return { user: usuario };
    },
  );

  app.post(
    '/auth/change-password',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['identity'],
        summary: 'Troca a senha e derruba os outros dispositivos',
        description:
          'Exige o cookie de sessão E a senha atual — só o cookie faria de qualquer ' +
          'máquina destravada um sequestro permanente da conta. Em caso de sucesso, ' +
          'todas as outras sessões da conta são revogadas; a que fez a troca sobrevive. ' +
          'Não é o fluxo de "esqueci minha senha", que é a #51.',
        body: changePasswordRequestSchema,
        response: { 200: changePasswordResponseSchema, 401: apiErrorSchema, 422: apiErrorSchema },
      },
    },
    async (request, reply) => {
      await trocarSenha(
        {
          usuarios: prismaUserRepository,
          verificar: verificarSenha,
          gerarHash: gerarHashDeSenha,
        },
        sessoes.usuarioAutenticado(request),
        request.body,
      );

      // A ordem importa: revogar antes de a senha estar trocada deixaria uma
      // janela em que os outros dispositivos caíram por nada, se a escrita
      // falhasse. Depois, o pior caso é a senha nova valendo com uma sessão
      // antiga a mais viva — que a pessoa ainda pode derrubar pela listagem.
      // Quem trocou a senha continua logada de propósito: deslogar quem
      // acabou de provar que sabe a senha atual pune o comportamento certo.
      const revokedSessions = await sessoes.revogarOutras(request);

      return reply.status(200).send({ status: 'senha-alterada' as const, revokedSessions });
    },
  );
};
