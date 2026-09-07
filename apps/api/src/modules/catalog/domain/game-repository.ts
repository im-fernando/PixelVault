import type { Game, GameListQuery } from '@pixelvault/contracts';

/**
 * Porta de persistência do catálogo.
 *
 * Declarada no domínio e implementada em infrastructure/ — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 */
export interface GameRepository {
  list(query: GameListQuery): Promise<Game[]>;
  findBySlug(slug: string): Promise<Game | null>;
}
