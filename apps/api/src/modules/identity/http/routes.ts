import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  abilitiesResponseSchema,
  apiErrorSchema,
  authenticatedUserResponseSchema,
  changePasswordRequestSchema,
  changePasswordResponseSchema,
  forgotPasswordRequestSchema,
  forgotPasswordResponseSchema,
  loginRequestSchema,
  registerRequestSchema,
  registerResponseSchema,
  resetPasswordRequestSchema,
  resetPasswordResponseSchema,
  updatePublicProfileRequestSchema,
} from '@pixelvault/contracts';
import type { Sessoes } from '../../sessions/index.js';
import { autenticarUsuario } from '../application/autenticar-usuario.js';
import { buscarUsuarioAutenticado } from '../application/buscar-usuario-autenticado.js';
import { definirVisibilidadeDoPerfil } from '../application/definir-visibilidade-do-perfil.js';
import { redefinirSenha } from '../application/redefinir-senha.js';
import { registrarUsuario } from '../application/registrar-usuario.js';
import { solicitarRecuperacaoDeSenha } from '../application/solicitar-recuperacao-de-senha.js';
import { trocarSenha } from '../application/trocar-senha.js';
import type { EnvioDeEmail } from '../domain/envio-de-email.js';
import {
  gerarHashDeSenha,
  HASH_DESCARTAVEL,
  verificarERehash,
  verificarSenha,
} from '../infrastructure/hash-de-senha.js';
import { prismaTokenDeRecuperacaoRepository } from '../infrastructure/prisma-token-de-recuperacao-repository.js';
import { prismaUserRepository } from '../infrastructure/prisma-user-repository.js';
import {
  gerarTokenDeRecuperacao,
  hashDoTokenDeRecuperacao,
} from '../infrastructure/token-de-recuperacao.js';
import { regrasDeHabilidadeDoUsuario } from './habilidades.js';
import type { LimitesDeAutenticacao } from './limite-de-autenticacao.js';

export interface OpcoesDeIdentity extends FastifyPluginOptions {
  /**
   * O módulo `sessions`, injetado pela composition root. `identity` sabe
   * conferir credencial; abrir e resolver sessão é do outro lado da
   * fronteira, e a única coisa que atravessa é esta interface.
   */
  sessoes: Sessoes;
  /**
   * Os ganchos de rate limit das rotas de credencial. Vêm da composition
   * root porque dependem do `SESSION_SECRET`, que é configuração e não
   * pertence a este arquivo. Ver `limite-de-autenticacao.ts`.
   */
  limites: LimitesDeAutenticacao;
  /**
   * Por onde o e-mail de recuperação sai. Vem da composition root porque a
   * escolha entre console e Resend é de configuração, não deste arquivo.
   * Ver docs/adr/0021.
   */
  envioDeEmail: EnvioDeEmail;
  /**
   * A origem do front (`WEB_ORIGIN`), de onde o link do e-mail é montado.
   * Configuração, e nunca um cabeçalho da requisição: montar o link a partir
   * de `Host` deixaria qualquer pessoa escolher para onde aponta o link de
   * redefinição de outra.
   */
  origemDoFront: string;
}

/**
 * Camada HTTP fina: valida, delega ao caso de uso e serializa. Nenhuma regra
 * de negócio mora aqui — inclusive as três decisões de responder igual
 * (e-mail duplicado no cadastro, e-mail inexistente ou senha errada no login,
 * conta inexistente na recuperação), que são dos casos de uso.
 */
export const identityRoutes: FastifyPluginAsyncZod<OpcoesDeIdentity> = async (app, opcoes) => {
  const { sessoes, limites, envioDeEmail, origemDoFront } = opcoes;

  app.post(
    '/auth/register',
    {
      preValidation: limites.cadastro.preValidation,
      onSend: limites.cadastro.onSend,
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
      preValidation: limites.login.preValidation,
      onSend: limites.login.onSend,
      schema: {
        tags: ['identity'],
        summary: 'Autentica e abre sessão',
        description:
          'E-mail inexistente e senha errada produzem a mesma resposta, com o mesmo ' +
          'custo de tempo. Em caso de sucesso, a sessão vai num cookie httpOnly — o ' +
          'token nunca aparece no corpo. É a rota mais protegida da API contra ' +
          'repetição: conta tentativas por IP e pelo e-mail tentado, e responde 429 ' +
          'com `RATE_LIMITED` quando qualquer um dos dois estoura.',
        body: loginRequestSchema,
        response: {
          200: authenticatedUserResponseSchema,
          401: apiErrorSchema,
          429: apiErrorSchema,
        },
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

  app.get(
    '/auth/abilities',
    {
      schema: {
        tags: ['identity'],
        summary: 'O que quem está pedindo pode fazer',
        description:
          'As regras de autorização de quem chamou, no formato nativo do CASL — o ' +
          'front joga o array direto no `createMongoAbility` e obtém a mesma `Ability` ' +
          'que o servidor usa. Serve para esconder o que a pessoa não pode fazer, e ' +
          'nada além disso: quem autoriza é o servidor, em cada requisição. ' +
          'Responde 200 sem sessão também, com as regras do visitante (ler o catálogo ' +
          'e jogar homebrew) — é o único jeito de o front saber o que desenhar antes ' +
          'de alguém entrar.',
        response: { 200: abilitiesResponseSchema },
      },
    },
    async (request) => ({ rules: await regrasDeHabilidadeDoUsuario(request.userId) }),
  );

  app.post(
    '/auth/change-password',
    {
      preValidation: limites.trocaDeSenha.preValidation,
      preHandler: sessoes.exigirSessao,
      onSend: limites.trocaDeSenha.onSend,
      schema: {
        tags: ['identity'],
        summary: 'Troca a senha e derruba os outros dispositivos',
        description:
          'Exige o cookie de sessão E a senha atual — só o cookie faria de qualquer ' +
          'máquina destravada um sequestro permanente da conta. Em caso de sucesso, ' +
          'todas as outras sessões da conta são revogadas; a que fez a troca sobrevive. ' +
          'Não é o fluxo de "esqueci minha senha", que é a #51.',
        body: changePasswordRequestSchema,
        response: {
          200: changePasswordResponseSchema,
          401: apiErrorSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
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

  app.patch(
    '/auth/public-profile',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['identity'],
        summary: 'Liga ou desliga o perfil público da própria conta',
        description:
          'Quando desligado, `GET /api/profiles/:handle` responde 404 para esta conta — ' +
          'o mesmo 404 de um handle que nunca existiu, para a rota não virar oráculo de ' +
          '"este handle existe, só está escondido".',
        body: updatePublicProfileRequestSchema,
        response: { 200: authenticatedUserResponseSchema, 401: apiErrorSchema },
      },
    },
    async (request, reply) => {
      const usuario = await definirVisibilidadeDoPerfil(
        { usuarios: prismaUserRepository },
        sessoes.usuarioAutenticado(request),
        request.body.enabled,
      );
      return reply.status(200).send({ user: usuario });
    },
  );

  app.post(
    '/auth/forgot-password',
    {
      preValidation: limites.recuperacaoDeSenha.preValidation,
      onSend: limites.recuperacaoDeSenha.onSend,
      schema: {
        tags: ['identity'],
        summary: 'Pede o link de redefinição de senha',
        description:
          'Responde 202 sempre, com o mesmo corpo, exista conta com esse e-mail ou ' +
          'não — e sem esperar o provedor de e-mail responder, para que o relógio ' +
          'também não conte a diferença. Quem tem conta recebe um link de uso único, ' +
          'válido por 30 minutos. Rate limit próprio e estreito: aqui cada requisição ' +
          'que encontra conta custa dinheiro e reputação de domínio, não CPU.',
        body: forgotPasswordRequestSchema,
        response: {
          202: forgotPasswordResponseSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      await solicitarRecuperacaoDeSenha(
        {
          tokens: prismaTokenDeRecuperacaoRepository,
          gerarToken: gerarTokenDeRecuperacao,
          hashDoToken: hashDoTokenDeRecuperacao,
          origemDoFront,
          agora: () => new Date(),
          // Fora da requisição de propósito: esperar a entrega faria o
          // caminho "existe conta" durar visivelmente mais que o outro, e o
          // cronômetro desfaria a anti-enumeração. Falha de envio vira log
          // do servidor — nunca resposta diferente. Ver o caso de uso.
          despachar: (mensagem) => {
            void envioDeEmail.enviar(mensagem).catch((erro: unknown) => {
              request.log.error(
                { err: erro, evento: 'auth.email-de-recuperacao-nao-enviado' },
                'falha ao entregar o e-mail de recuperação de senha',
              );
            });
          },
        },
        request.body,
      );

      // 202 nos dois casos: "Created" ou "OK" afirmariam o que foi feito, e é
      // justamente o que não pode variar aqui.
      return reply.status(202).send({ status: 'recuperacao-solicitada' as const });
    },
  );

  app.post(
    '/auth/reset-password',
    {
      schema: {
        tags: ['identity'],
        summary: 'Redefine a senha pelo link do e-mail',
        description:
          'O token do link é a prova de identidade, e vale uma vez só: usá-lo de novo ' +
          'falha como se ele nunca tivesse existido. A senha nova passa pela mesma ' +
          'política do cadastro. Em caso de sucesso, TODAS as sessões da conta caem — ' +
          'sem exceção, porque quem chega aqui não está logado e não tem sessão atual ' +
          'a preservar. Não tem contador próprio de tentativas: o token são 256 bits ' +
          'aleatórios, não há o que adivinhar, e o Argon2id só é pago depois de o ' +
          'token se provar válido.',
        body: resetPasswordRequestSchema,
        response: {
          200: resetPasswordResponseSchema,
          422: apiErrorSchema,
          429: apiErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const userId = await redefinirSenha(
        {
          usuarios: prismaUserRepository,
          tokens: prismaTokenDeRecuperacaoRepository,
          hashDoToken: hashDoTokenDeRecuperacao,
          gerarHash: gerarHashDeSenha,
          agora: () => new Date(),
        },
        request.body,
      );

      // Mesma ordem da troca de senha autenticada: a senha nova primeiro,
      // as sessões depois. Revogar antes deixaria a pessoa deslogada de
      // todos os aparelhos por nada, se a escrita da senha falhasse.
      const revokedSessions = await sessoes.revogarTodasDoUsuario(userId);

      return reply.status(200).send({ status: 'senha-redefinida' as const, revokedSessions });
    },
  );
};
