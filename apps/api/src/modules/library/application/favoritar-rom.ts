import type { RomFavoriteResponse } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, recurso, type Habilidades } from '../../identity/index.js';
import type { UserRomRepository } from '../domain/user-rom-repository.js';

/** O mesmo nome de recurso do download e da remoção. Um só, e é esse o ponto. */
const NOME_DO_RECURSO = 'ROM';

export interface DependenciasDoFavorito {
  roms: UserRomRepository;
}

/**
 * Põe (ou tira) a ROM entre as favoritas de quem pediu.
 *
 * ## Por que o favorito é do cartucho, e não do jogo
 *
 * `user_games.is_favorite` existia desde a M0 e foi removido na #75 em favor
 * de `user_roms.is_favorite`. O motivo é o BYOR: `game_id` nulo é o caso comum
 * (ADR 0006), porque o catálogo só conhece homebrew e quase todo envio de
 * verdade não casa com nada. Favoritar por jogo seria um botão que não
 * funciona justamente para a maioria da estante.
 *
 * Manter as duas colunas seria pior que escolher errado: duas versões da mesma
 * verdade, escritas por caminhos diferentes, divergindo na primeira tela que
 * usasse a coluna errada. Se um dia existir "favoritar um jogo que você não
 * tem" — uma lista de desejos, assunto de perfil —, é outro conceito, e ganha
 * a coluna dele com esse nome.
 *
 * O efeito colateral bom é que favoritar passa a distinguir dois cartuchos do
 * mesmo jogo: a versão que você joga e a que você guardou por completismo são
 * linhas diferentes em `user_roms`, e agora podem ter estados diferentes.
 *
 * ## Estado desejado, não alternância
 *
 * O caso de uso recebe `favorito` em vez de virar o valor que estiver lá. Dois
 * cliques rápidos, ou um retry depois de timeout, terminam onde a pessoa
 * queria — e é o que permite às rotas serem `PUT` e `DELETE`, que prometem
 * idempotência.
 *
 * A busca antes da escrita não é desperdício: é ela que dá o dono para a
 * pergunta de autorização, e é o mesmo 404 do download que sai quando a
 * resposta é não. Um `UPDATE ... WHERE id = ? AND user_id = ?` responderia
 * "zero linhas" para os dois casos sem passar pelo CASL, e a regra de
 * propriedade deixaria de estar num lugar só.
 */
export async function definirFavoritoDaRom(
  deps: DependenciasDoFavorito,
  habilidades: Habilidades,
  romId: string,
  favorito: boolean,
): Promise<RomFavoriteResponse> {
  const rom = await deps.roms.buscarPorId(romId);
  if (rom === null) throw new NotFoundError(NOME_DO_RECURSO);

  autorizarOuNaoEncontrado(
    habilidades,
    'update',
    recurso('Library', { userId: rom.userId }),
    NOME_DO_RECURSO,
  );

  await deps.roms.definirFavorito(rom.id, favorito);

  return { romId: rom.id, isFavorite: favorito };
}
