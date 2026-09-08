import { z } from 'zod';
import { coverRefSchema } from '../catalog/game.js';
import { sha256Schema, systemIdSchema, uuidSchema } from '../shared/primitives.js';
import { TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO } from './uploads.js';

/**
 * Um cartucho na estante de alguém — o item de `GET /api/library/roms`.
 *
 * É a ficha da ROM **enviada**, e não a do jogo do catálogo: o que a pessoa
 * tem é o arquivo dela, e o catálogo entra só quando o hash casou com alguma
 * coisa (ADR 0006). Por isso os campos que dependem do catálogo — `gameId` e
 * `coverUrl` — são nulos no caso comum, e o `title` continua preenchido do
 * mesmo jeito.
 *
 * ## De onde sai o `title`
 *
 * Do catálogo quando `gameId` existe; do `fileName` quando não. Um "não
 * identificado" na etiqueta seria a interface desistindo de algo que ela sabe:
 * quem enviou `Chrono Trigger (USA).sfc` reconhece o próprio arquivo na
 * prateleira, e o nome que ele deu é a única coisa que temos para chamar
 * aquele cartucho pelo nome. A limpeza é mínima de propósito — tira a extensão
 * e troca `_` por espaço —, porque adivinhar região, revisão e romhack a
 * partir do nome erraria com confiança.
 *
 * Quem monta o título é o servidor, e não o cliente: é uma regra só, do lado
 * que já tem as duas fontes na mão.
 *
 * ## Por que `systemId` é anulável
 *
 * Ele vem do catálogo quando há jogo, e da extensão do arquivo quando não há.
 * Hoje o segundo caminho não falha — a verificação do envio (ADR 0014) recusa
 * extensão que não seja de sistema suportado, então toda linha de `user_roms`
 * tem uma reconhecível. O nulo é honestidade sobre o dia em que essa lista
 * mudar: uma ROM que continua na biblioteca de alguém não pode sumir da
 * listagem porque o servidor deixou de saber de que console ela é.
 *
 * ## O que não está aqui
 *
 * A `storageKey`. É endereço de um objeto compartilhado por conteúdo (ADR
 * 0013), fica no servidor, e quem quer os bytes pede a URL assinada em
 * `GET /api/library/roms/:romId/download`.
 */
export const libraryRomSchema = z.object({
  /** A linha em `user_roms`. É por ela que baixar, favoritar e remover pedem. */
  id: uuidSchema,
  /** Do catálogo quando reconhecida; do nome do arquivo quando não. */
  title: z.string().min(1).max(200),
  /** Do catálogo, ou inferido pela extensão. Nulo quando nem isso responde. */
  systemId: systemIdSchema.nullable(),
  /** O jogo do catálogo, quando o hash casou. Nulo é o caso comum do BYOR. */
  gameId: uuidSchema.nullable(),
  /** A capa do jogo reconhecido. ROM sem jogo não tem capa — e nem deveria. */
  coverUrl: coverRefSchema.nullable(),
  /** O nome que a pessoa deu ao arquivo dela, como está em `user_roms`. */
  fileName: z.string().min(1).max(TAMANHO_MAXIMO_DO_NOME_DE_ARQUIVO),
  sizeBytes: z.number().int().positive(),
  /** O hash calculado pelo servidor no envio. Identidade do conteúdo. */
  sha256: sha256Schema,
  isFavorite: z.boolean(),
  /** Quando a ROM entrou na biblioteca. Carimbo do servidor. */
  uploadedAt: z.iso.datetime(),
});
export type LibraryRom = z.infer<typeof libraryRomSchema>;

/**
 * A biblioteca inteira numa resposta, sem paginação.
 *
 * A cota fecha a conta em 1500 ROMs por pessoa (`COTA_DE_ROMS_POR_CONTA`), e
 * é ela que torna isto seguro: o teto da resposta é conhecido e pequeno, e a
 * prateleira do front precisa da coleção inteira para ordenar e contar. Uma
 * paginação aqui existiria para um caso que a cota não deixa acontecer.
 */
export const libraryRomListSchema = z.array(libraryRomSchema);
export type LibraryRomList = z.infer<typeof libraryRomListSchema>;

/**
 * Resposta de `DELETE /api/library/roms/:romId`.
 *
 * Um estado só, e ele fala da biblioteca de quem pediu: a referência saiu. O
 * que a resposta **não** diz é se o objeto em `roms/<sha256>` foi coletado —
 * isso depende de outra pessoa ter, ou não, o mesmo conteúdo, e responder
 * transformaria a remoção num oráculo de "alguém mais tem esta ROM", que é o
 * que a [ADR 0013](../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md)
 * proíbe. A coleta é assunto do servidor.
 */
export const romRemovedResponseSchema = z.object({
  status: z.literal('rom-removida'),
});
export type RomRemovedResponse = z.infer<typeof romRemovedResponseSchema>;

/**
 * Resposta de `PUT` e `DELETE /api/library/roms/:romId/favorite`.
 *
 * Devolve o estado final em vez de um `status` de ação porque as duas rotas
 * são idempotentes: favoritar o que já era favorito responde a mesma coisa
 * que favoritar pela primeira vez, e o front só precisa saber como o cartucho
 * ficou.
 */
export const romFavoriteResponseSchema = z.object({
  romId: uuidSchema,
  isFavorite: z.boolean(),
});
export type RomFavoriteResponse = z.infer<typeof romFavoriteResponseSchema>;
