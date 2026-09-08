/**
 * O que o `library` precisa perguntar ao catálogo: "de que jogo é este hash?".
 *
 * É uma porta declarada por quem consome (ADR 0004), e não o tipo importado do
 * outro módulo. Duas razões:
 *
 * - **O domínio fica sozinho.** `domain/` não conhece o `catalog`, nem que
 *   fosse pelo `index.ts` dele. Quem amarra os dois é a borda, na hora de
 *   montar o caso de uso.
 * - **A pergunta é do `library`.** O catálogo responde sobre jogos; esta
 *   assinatura é o recorte mínimo do BYOR — nada de `Game`, `GameDetail` nem
 *   capa. Se um dia o match vier de outro lugar (uma base externa, um índice
 *   próprio), muda o adaptador e não o caso de uso.
 *
 * A consulta recebe **os dois hashes** — o do arquivo como veio e o de sem o
 * cabeçalho de copiador — porque as bases de metadado catalogam sem cabeçalho,
 * e um dump de SNES com os 512 bytes na frente jamais casaria pelo hash cru.
 */

import type { SystemId } from '@pixelvault/contracts';

/** O jogo do catálogo que aquele conteúdo é. */
export interface RomIdentificada {
  gameId: string;
}

export type IdentificarRomNoCatalogo = (
  hashes: readonly string[],
) => Promise<RomIdentificada | null>;

/**
 * A segunda pergunta que a biblioteca faz ao catálogo: "como se chamam estes
 * jogos, e que capa eles têm?".
 *
 * Nasce com a listagem da #75, e o recorte segue o da pergunta anterior: só o
 * que a etiqueta da estante precisa. Nada de `Game` inteiro — `slug`,
 * `publisher`, `releaseYear` e `isHomebrew` são vocabulário do catálogo, e
 * arrastá-los para cá faria a biblioteca conhecer um tipo que ela não usa.
 *
 * Recebe e devolve uma lista porque a listagem tem N ROMs reconhecidas e uma
 * consulta só resolve todas — uma pergunta por linha seria N+1 contra o banco
 * para desenhar uma prateleira. Jogo que não existir mais simplesmente não
 * volta: a lista de resposta não promete ter o mesmo tamanho da de entrada, e
 * quem chama trata a ausência como "sem ficha", que é o mesmo caso de uma ROM
 * nunca reconhecida.
 */
export interface JogoDoCatalogo {
  gameId: string;
  title: string;
  systemId: SystemId;
  coverUrl: string | null;
}

export type DescreverJogosDoCatalogo = (
  gameIds: readonly string[],
) => Promise<readonly JogoDoCatalogo[]>;
