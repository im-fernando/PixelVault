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

/** O jogo do catálogo que aquele conteúdo é. */
export interface RomIdentificada {
  gameId: string;
}

export type IdentificarRomNoCatalogo = (
  hashes: readonly string[],
) => Promise<RomIdentificada | null>;
