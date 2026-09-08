import type { Game, GameDetail, GameListQuery } from '@pixelvault/contracts';

/**
 * Porta de persistência do catálogo.
 *
 * Declarada no domínio e implementada em infrastructure/ — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * A listagem devolve `Game` e o detalhe devolve `GameDetail` de propósito: a
 * referência da ROM só faz sentido para quem vai carregar o jogo, e arrastá-la
 * pela lista inteira significaria uma junção a mais em toda abertura da home.
 */
/** O que o catálogo sabe sobre um hash de ROM: de que jogo ele é. */
export interface RomDoCatalogo {
  gameId: string;
}

export interface GameRepository {
  list(query: GameListQuery): Promise<Game[]>;
  findBySlug(slug: string): Promise<GameDetail | null>;

  /**
   * O jogo cujo `game_roms.sha256` é um dos hashes, ou `null`.
   *
   * Recebe mais de um hash porque quem pergunta (o BYOR, no `library`) tem
   * dois: o do arquivo como o usuário enviou e o de sem o cabeçalho de
   * copiador de SNES. As bases de metadado catalogam sem cabeçalho, então
   * tentar só o hash cru deixaria de reconhecer metade dos dumps de SNES.
   *
   * Não devolve o jogo inteiro, e isso é o recorte: quem casa hash quer saber
   * a qual jogo ligar a linha de `user_roms`. Título e capa, quem os quer pede
   * ao catálogo pelo caminho normal.
   */
  identificarRomPorHash(hashes: readonly string[]): Promise<RomDoCatalogo | null>;
}
