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
export interface GameRepository {
  list(query: GameListQuery): Promise<Game[]>;
  findBySlug(slug: string): Promise<GameDetail | null>;
}
