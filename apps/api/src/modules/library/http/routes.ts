import type { FastifyPluginOptions } from 'fastify';
import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  apiErrorSchema,
  libraryRomListSchema,
  romDownloadResponseSchema,
  romFavoriteResponseSchema,
  romRecognitionSweepResponseSchema,
  romRemovedResponseSchema,
  romUploadCompletedResponseSchema,
  romUploadCompletionSchema,
  romUploadRequestSchema,
  romUploadResponseSchema,
  uuidSchema,
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
} from '@pixelvault/contracts';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../../../infrastructure/storage/armazenamento-de-objetos.js';
import { descreverJogos, identificarRomPorHash } from '../../catalog/index.js';
import {
  autorizarOuProibido,
  habilidadesDoUsuario,
  recurso,
  type Acao,
} from '../../identity/index.js';
import type { Sessoes } from '../../sessions/index.js';
import { autorizarDownloadDeRom } from '../application/autorizar-download-de-rom.js';
import { confirmarEnvioDeRom } from '../application/confirmar-envio-de-rom.js';
import { definirFavoritoDaRom } from '../application/favoritar-rom.js';
import { listarBiblioteca } from '../application/listar-biblioteca.js';
import { removerRomDaBiblioteca } from '../application/remover-rom-da-biblioteca.js';
import { reprocessarReconhecimento } from '../application/reprocessar-reconhecimento.js';
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
   * A habilidade da #48 sobre a PRÓPRIA biblioteca, perguntada contra o
   * recurso e não contra o nome do assunto: a regra é `conditions: { userId }`,
   * e perguntar pelo tipo responderia "pode em alguma biblioteca", que é sim
   * para todo mundo. Aqui 403 é a resposta certa — não há recurso de terceiros
   * cuja existência esconder, só permissão que falta.
   *
   * Serve às rotas que partem da sessão e não recebem id nenhum: enviar e
   * listar. Onde há `:romId` no caminho, a pergunta é outra — ela precisa da
   * linha na mão para saber de quem ela é, e a negativa é 404. Ver
   * `autorizar-download-de-rom.ts`.
   */
  async function exigirPoderSobreAPropriaBiblioteca(userId: string, acao: Acao): Promise<void> {
    autorizarOuProibido(await habilidadesDoUsuario(userId), acao, recurso('Library', { userId }));
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
          `é assinado. O teto por arquivo é de ${TAMANHO_MAXIMO_DE_ROM_EM_BYTES} bytes, e o ` +
          `total por conta é de ${COTA_DE_ARMAZENAMENTO_EM_BYTES} bytes em até ` +
          `${COTA_DE_ROMS_POR_CONTA} ROMs (docs/seguranca.md). Biblioteca sem espaço para o ` +
          'arquivo pedido responde 409 com o eixo estourado em `details.cota`, e nada é ' +
          'assinado — a cota é conferida antes da assinatura.',
        body: romUploadRequestSchema,
        response: {
          200: romUploadResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
          409: apiErrorSchema,
          422: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderSobreAPropriaBiblioteca(userId, 'create');

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
      await exigirPoderSobreAPropriaBiblioteca(userId, 'create');

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
   * A sub-árvore `/library/roms` — a coleção de que a #75 é a listagem.
   *
   * O nome do recurso é `roms` porque é isso que a biblioteca guarda: o
   * arquivo da pessoa. Não é `/library/games`, ainda que a etiqueta de uma ROM
   * reconhecida venha do catálogo — o que se lista, favorita e remove aqui é a
   * linha de `user_roms`, e chamá-la de jogo faria a URL prometer um recurso
   * do outro módulo.
   */
  app.get(
    '/library/roms',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library'],
        summary: 'A biblioteca pessoal de quem está pedindo',
        description:
          'As ROMs que a pessoa enviou, com favorito na frente e o mais recente primeiro. ' +
          'Sempre e só as dela: a consulta parte do `userId` da sessão, e não há parâmetro ' +
          'que aponte para a biblioteca de outra pessoa (docs/adr/0013). O `title` vem do ' +
          'catálogo quando o hash foi reconhecido e do nome do arquivo quando não — ' +
          '`gameId` nulo é o caso comum do BYOR, não erro (docs/adr/0006) —, e o ' +
          '`systemId` segue a mesma ordem: o do jogo, ou o que a extensão declara. Sem ' +
          'paginação: a cota fecha a biblioteca em ' +
          `${COTA_DE_ROMS_POR_CONTA} ROMs. A chave do objeto no storage não sai daqui; ` +
          'para os bytes, peça a URL assinada em `/library/roms/:romId/download`.',
        response: { 200: libraryRomListSchema, 401: apiErrorSchema, 403: apiErrorSchema },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      await exigirPoderSobreAPropriaBiblioteca(userId, 'read');

      return listarBiblioteca(
        // O título e a capa dos jogos reconhecidos vêm do `catalog` pela
        // fachada dele, como o match de hash: `games` é tabela de outro
        // módulo, e o `library` pergunta em vez de consultar.
        { roms: prismaUserRomRepository, catalogo: descreverJogos },
        userId,
      );
    },
  );

  /**
   * `/library/roms/:romId/download`, e não `/library/:romId/download`.
   *
   * O `library` já tem uma sub-árvore de substantivo (`/library/uploads`), e
   * um `:romId` solto no primeiro nível conviveria com ela lendo como se
   * `uploads` fosse o id de alguma coisa. Com `roms/` no meio, a coleção fica
   * dita: a biblioteca tem envios e tem ROMs. A listagem e a remoção da #75
   * caíram sozinhas em `GET /library/roms` e `DELETE /library/roms/:romId`,
   * sem ninguém precisar renomear nada — que era o ponto.
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

  app.delete(
    '/library/roms/:romId',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library'],
        summary: 'Tira uma ROM da própria biblioteca',
        description:
          'Apaga a referência em `user_roms`. O objeto em `roms/<sha256>` só é coletado ' +
          'quando nenhuma outra linha o referencia — ele é compartilhado por todo mundo ' +
          'que tem aquele conteúdo, e apagá-lo por causa de uma remoção destruiria a ROM ' +
          'de estranhos (docs/adr/0013). A remoção e a contagem acontecem na mesma ' +
          'transação; a resposta não diz se o objeto morreu junto, porque isso contaria ' +
          'que outra pessoa tem o mesmo arquivo. ROM de outra pessoa e id que nunca ' +
          'existiu respondem o mesmo 404 do download, byte a byte.',
        params: z.object({ romId: uuidSchema }),
        response: {
          200: romRemovedResponseSchema,
          400: apiErrorSchema,
          401: apiErrorSchema,
          404: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);

      return removerRomDaBiblioteca(
        { roms: prismaUserRomRepository, armazenamento },
        await habilidadesDoUsuario(userId),
        request.params.romId,
      );
    },
  );

  /**
   * Favoritar é `PUT` e desfavoritar é `DELETE` sobre o mesmo caminho, e não
   * um `PATCH` com o estado no corpo.
   *
   * O favorito é uma marca que existe ou não existe sobre a ROM, e um
   * sub-recurso sem corpo diz exatamente isso: pôr a marca duas vezes é o
   * mesmo que pô-la uma, e tirar a que não estava lá não é erro. É a
   * idempotência que os dois métodos já prometem, de graça — com `PATCH`, ela
   * passaria a depender do que o corpo diz, e um corpo de um booleano é um
   * corpo a validar, versionar e documentar por nada.
   *
   * O caminho é `favorite`, em inglês, como o resto das URLs da API.
   */
  const caminhoDoFavorito = '/library/roms/:romId/favorite';
  const esquemaDoFavorito = {
    tags: ['library'],
    params: z.object({ romId: uuidSchema }),
    response: {
      200: romFavoriteResponseSchema,
      400: apiErrorSchema,
      401: apiErrorSchema,
      404: apiErrorSchema,
    },
  } as const;

  const descricaoDoFavorito =
    'O favorito é do cartucho, e não do jogo do catálogo: a coluna mora em `user_roms`, ' +
    'porque `game_id` nulo é o caso comum do BYOR (docs/adr/0006) e favoritar por jogo ' +
    'não funcionaria para a maioria da estante. Idempotente. ROM de outra pessoa e id ' +
    'que nunca existiu respondem o mesmo 404 do download.';

  app.put(
    caminhoDoFavorito,
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        ...esquemaDoFavorito,
        summary: 'Marca uma ROM da própria biblioteca como favorita',
        description: descricaoDoFavorito,
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);

      return definirFavoritoDaRom(
        { roms: prismaUserRomRepository },
        await habilidadesDoUsuario(userId),
        request.params.romId,
        true,
      );
    },
  );

  app.delete(
    caminhoDoFavorito,
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        ...esquemaDoFavorito,
        summary: 'Tira a marca de favorita de uma ROM da própria biblioteca',
        description: descricaoDoFavorito,
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);

      return definirFavoritoDaRom(
        { roms: prismaUserRomRepository },
        await habilidadesDoUsuario(userId),
        request.params.romId,
        false,
      );
    },
  );

  /**
   * A lacuna 2 da issue #114: religar `user_roms.game_id` quando o catálogo
   * ganha uma entrada nova depois que alguém já subiu aquele jogo.
   *
   * Fica em `library`, e não em `catalog`, porque quem muda é `user_roms` —
   * tabela deste módulo — e é `library` quem já importa `identificarRomPorHash`
   * pela fachada do `catalog` (mesmo caminho de `confirmar-envio-de-rom.ts`).
   * `catalog` continua sem saber que `user_roms` existe.
   *
   * É rota administrativa e global — nenhum `:userId` no caminho — porque o
   * evento que a justifica é "a curadoria mudou o catálogo", não "esta conta
   * quer tentar de novo". Ver o cabeçalho de `reprocessar-reconhecimento.ts`
   * para as alternativas descartadas. A habilidade exigida é `manage` sobre
   * `Game` — a mesma que já administra o catálogo (docs/adr/0018) — e não uma
   * habilidade sobre `Library`: não há biblioteca de ninguém específico em
   * jogo aqui, e uma pessoa comum promovida a `admin` só manualmente, por
   * decisão deliberada (ver `schema.prisma`, coluna `User.role`).
   */
  app.post(
    '/admin/library/roms/recognize',
    {
      preHandler: sessoes.exigirSessao,
      schema: {
        tags: ['library', 'admin'],
        summary: 'Reprocessa ROMs sem jogo reconhecido contra o catálogo atual',
        description:
          'Varre toda a `user_roms` com `game_id` nulo — de qualquer conta, não só da de ' +
          'quem chama — e tenta casar cada hash contra o catálogo pela mesma lógica do ' +
          'upload (`identificarRomPorHash`). ROM que casar tem o `game_id` religado e ' +
          'entra na busca de capa (#77) do mesmo jeito que um upload recém-reconhecido ' +
          'entraria. Existe porque hoje o match só acontece na confirmação do envio: se o ' +
          'catálogo ganha uma entrada depois que alguém já subiu aquele jogo, sem esta ' +
          'rota o único jeito de religar o vínculo seria SQL manual (issue #114). Exige ' +
          '`manage` sobre `Game` — a mesma habilidade que administra o catálogo — e não ' +
          'uma habilidade sobre a própria biblioteca: é operação de catálogo, não de ' +
          'acervo de ninguém específico.',
        response: {
          200: romRecognitionSweepResponseSchema,
          401: apiErrorSchema,
          403: apiErrorSchema,
        },
      },
    },
    async (request) => {
      const userId = sessoes.usuarioAutenticado(request);
      autorizarOuProibido(await habilidadesDoUsuario(userId), 'manage', 'Game');

      return reprocessarReconhecimento({
        roms: prismaUserRomRepository,
        catalogo: identificarRomPorHash,
      });
    },
  );
};
