import rateLimit from '@fastify/rate-limit';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  apiErrorSchema,
  registerRequestSchema,
  registerResponseSchema,
} from '@pixelvault/contracts';
import { DomainError } from '../../../infrastructure/errors.js';
import { registrarUsuario } from '../application/registrar-usuario.js';
import { gerarHashDeSenha } from '../infrastructure/hash-de-senha.js';
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
 */
const LIMITE_DE_CADASTRO = { max: 5, timeWindow: '10 minutes' } as const;

/**
 * Camada HTTP fina: valida, delega ao caso de uso e serializa. Nenhuma regra
 * de negócio mora aqui — inclusive a decisão de responder igual para e-mail
 * duplicado, que é do caso de uso.
 */
export const identityRoutes: FastifyPluginAsyncZod = async (app) => {
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
};
