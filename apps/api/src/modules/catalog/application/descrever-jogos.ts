import type { FichaDeJogo } from '../domain/game-repository.js';
import { prismaGameRepository } from '../infrastructure/prisma-game-repository.js';

/**
 * As fichas curtas de vários jogos, já ligadas ao repositório.
 *
 * Irmã de `identificarRomPorHash`, e pelo mesmo motivo dela: quem precisa da
 * resposta é outro módulo — o `library`, montando a estante da biblioteca
 * pessoal (#75) —, e nenhum módulo pode importar `catalog/infrastructure` para
 * injetar o repositório (ADR 0003). Quem faz a ligação é o próprio `catalog`.
 *
 * O `library` recebe isto como uma função (a porta `DescreverJogosDoCatalogo`,
 * que ele declara), e não como repositório: a biblioteca não precisa saber que
 * existe um catálogo com jogos, só que alguém sabe dizer como se chama o jogo
 * de um `game_id`.
 *
 * Diferente do match por hash, aqui **não** há busca de capa disparada por
 * fora. Ler não é o momento em que a informação nasce: quem reconhece um jogo
 * pela primeira vez é o upload, e é lá que a capa é procurada (ver
 * `identificar-rom.ts`). Pendurar a busca na listagem colocaria uma decisão de
 * rede no caminho de toda abertura da estante para achar, quase sempre, uma
 * capa que já está no banco.
 */
export async function descreverJogos(gameIds: readonly string[]): Promise<FichaDeJogo[]> {
  return prismaGameRepository.descreverJogos(gameIds);
}
