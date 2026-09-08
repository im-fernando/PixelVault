import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  romDownloadResponseSchema,
  romUploadCompletedResponseSchema,
  romUploadCompletionSchema,
  romUploadRequestSchema,
  romUploadResponseSchema,
  uuidSchema,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
} from '@pixelvault/contracts';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { identificarRomPorHash } from '../../catalog/index.js';
import { autorizarOuProibido, habilidadesDoUsuario, recurso } from '../../identity/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { autorizarDownloadDeRom } from '../application/autorizar-download-de-rom.js';
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
 * (`envio-autorizado`, `ja-na-biblioteca`, `na-biblioteca`).
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
        summary: 'Verifica a ROM na quarentena e a leva para a biblioteca',
        description:
          'Aqui o servidor lê os bytes da quarentena, calcula o SHA-256 dele mesmo e ' +
          'confere que aquilo é uma ROM do sistema que a extensão promete — tamanho na ' +
          'faixa do console e cabeçalho no lugar (docs/adr/0014). Passando, o objeto vai ' +
          'para `roms/<sha256>`; se aquele conteúdo já estiver lá, nada é transferido e ' +
          'a resposta vem com `deduplicado: true` (docs/adr/0013). O hash informado no ' +
          'pedido de upload não participa de nada disso. Recusa na verificação é 422 com ' +
          'o motivo em `details.rom`, e a quarentena é apagada. Envio inexistente e envio ' +
          'de outra pessoa respondem o mesmo 404 — a chave é montada a partir da sessão, ' +
          'então o segundo caso nem chega a existir.',
        params: z.object({ uploadId: uuidSchema }),
        body: romUploadCompletionSchema,
        response: {
          200: romUploadCompletedResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          404: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderDeEnviar(userId);

      return confirmarEnvioDeRom(
        // O match de hash vem do `catalog` pela fachada dele: `game_roms` é
        // tabela de outro módulo, e o `library` pergunta em vez de consultar.
        { armazenamento, roms: prismaUserRomRepository, catalogo: identificarRomPorHash },
        userId,
        request.params.uploadId,
        request.body.fileName,
      );
    },
  );

  /**
   * `/library/roms/:romId/download`, e não `/library/:romId/download`.
   *
   * O `library` já tem uma sub-árvore de substantivo (`/library/uploads`), e
   * um `:romId` solto no primeiro nível conviveria com ela lendo como se
   * `uploads` fosse o id de alguma coisa. Com `roms/` no meio, a coleção fica
   * dita: a biblioteca tem envios e tem ROMs, e a listagem e a remoção da #75
   * caem sozinhas em `GET /library/roms` e `DELETE /library/roms/:romId`, sem
   * ninguém precisar renomear nada depois.
   */
  app.get(
    '/library/roms/:romId/download',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library'],
        summary: 'Autoriza a leitura de uma ROM da própria biblioteca',
        description:
          'Devolve uma URL de GET assinada para os bytes da ROM, válida por ' +
          `${VALIDADE_PADRAO_EM_SEGUNDOS} segundos. A autorização vem do banco, nunca ` +
          'da URL (docs/adr/0013): o servidor busca a linha de `user_roms`, confere que ' +
          'ela é de quem está pedindo e só então assina — o objeto em `roms/<sha256>` é ' +
          'compartilhado por todo mundo que tem aquele conteúdo, e conhecer o id ou o ' +
          'hash não dá direito a nada. ROM de outra pessoa e id que nunca existiu ' +
          'respondem o mesmo 404, byte a byte: um 403 aqui diria "existe, mas não é sua", ' +
          'e quem varre ids alheios não deve conseguir separar as duas coisas.',
        params: z.object({ romId: uuidSchema }),
        response: {
          200: romDownloadResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);

      return autorizarDownloadDeRom(
        { roms: prismaUserRomRepository, armazenamento },
        // As habilidades vêm montadas da borda; quem pergunta com a linha na
        // mão é o caso de uso, porque só depois de buscar existe dono a
        // comparar.
        await habilidadesDoUsuario(userId),
        request.params.romId,
      );
    },
  );
};
