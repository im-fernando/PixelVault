import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  romUploadCompletedResponseSchema,
  romUploadRequestSchema,
  romUploadResponseSchema,
  uuidSchema,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
} from '@pixelvault/contracts';
import type { ArmazenamentoDeObjetos } from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { autorizarOuProibido, habilidadesDoUsuario, recurso } from '../../identity/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { confirmarEnvioDeRom } from '../application/confirmar-envio-de-rom.js';
import { solicitarEnvioDeRom } from '../application/solicitar-envio-de-rom.js';
import { prismaUserRomRepository } from '../infrastructure/prisma-user-rom-repository.js';

export interface OpcoesDeLibrary extends FastifyPluginOptions {
  /**
   * O módulo `sessions`, injetado pela composition root: toda rota daqui
   * exige alguém logado, e quem resolve sessão é o outro lado da fronteira.
   */
  sessoes: Sessoes;
  /**
   * A porta de object storage. Vem da composition root porque a escolha do
   * fornecedor (MinIO, R2) é configuração, e não deste arquivo — ver
   * docs/adr/0012 e o cabeçalho de `infrastructure/storage/`.
   */
  armazenamento: ArmazenamentoDeObjetos;
}

/**
 * Camada HTTP fina: valida, autoriza, delega e serializa.
 *
 * As URLs seguem o inglês do resto da API (`/auth/register`,
 * `/auth/sessions/revoke-others`, `/games`), como manda o CLAUDE.md para nome
 * de API pública. O vocabulário de domínio continua em português onde ele
 * mora: nos identificadores do código e nos `status` das respostas
 * (`envio-autorizado`, `recebido-aguardando-verificacao`).
 */
export const libraryRoutes: FastifyPluginAsyncZod<OpcoesDeLibrary> = async (app, opcoes) => {
  const { sessoes, armazenamento } = opcoes;

  /**
   * A habilidade `create Library` da #48, perguntada contra o recurso e não
   * contra o nome do assunto: a regra é `conditions: { userId }`, e perguntar
   * pelo tipo responderia "pode criar em alguma biblioteca", que é sim para
   * todo mundo. Aqui 403 é a resposta certa — não há recurso de terceiros
   * cuja existência esconder, só permissão que falta.
   */
  async function exigirPoderDeEnviar(userId: string): Promise<void> {
    autorizarOuProibido(
      await habilidadesDoUsuario(userId),
      'create',
      recurso('Library', { userId }),
    );
  }

  app.post(
    '/library/uploads',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library'],
        summary: 'Autoriza o envio de uma ROM para a quarentena',
        description:
          'Devolve uma URL de PUT assinada para `quarentena/<userId>/<uuid>` — o caminho ' +
          'é do servidor de ponta a ponta, e nunca `roms/<sha256>`: o destino definitivo ' +
          'é compartilhado por conteúdo, e deixar o cliente escolhê-lo seria deixá-lo ' +
          'gravar por cima da ROM alheia (docs/adr/0014). O `Content-Type` e o tamanho ' +
          'entram na assinatura, então a URL só serve para exatamente aqueles bytes. ' +
          'Informar o `sha256` é opcional e vale como dica: se aquele conteúdo já estiver ' +
          'na biblioteca de quem pediu, a resposta é `ja-na-biblioteca` e nenhum upload ' +
          `é assinado. O teto por arquivo é de ${TAMANHO_MAXIMO_DE_ROM_EM_BYTES} bytes.`,
        body: romUploadRequestSchema,
        response: {
          200: romUploadResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderDeEnviar(userId);

      return solicitarEnvioDeRom(
        { roms: prismaUserRomRepository, armazenamento },
        userId,
        request.body,
      );
    },
  );

  app.post(
    '/library/uploads/:uploadId/complete',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library'],
        summary: 'Avisa que o envio terminou',
        description:
          'Confirma que o objeto chegou à quarentena de quem está pedindo e responde ' +
          '`recebido-aguardando-verificacao`. A ROM ainda não é de ninguém: quem lê os ' +
          'bytes, calcula o SHA-256 de verdade e promove (ou apaga) é a verificação da ' +
          'issue #72. Envio inexistente e envio de outra pessoa respondem o mesmo 404 — ' +
          'a chave é montada a partir da sessão, então o segundo caso nem chega a existir.',
        params: z.object({ uploadId: uuidSchema }),
        response: {
          200: romUploadCompletedResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderDeEnviar(userId);

      return confirmarEnvioDeRom({ armazenamento }, userId, request.params.uploadId);
    },
  );
};
