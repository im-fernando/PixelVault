import type { Game, GameListQuery } from '@pixelvault/contracts';
import type { GameRepository } from '../domain/game-repository.js';

/**
 * Catálogo é CRUD: não há invariante para proteger aqui, então o caso de uso
 * é fino de propósito. Entidade rica neste módulo seria cerimônia pura.
 * Ver docs/adr/0005.
 */
export async function listGames(repository: GameRepository, query: GameListQuery): Promise<Game[]> {
  return repository.list(query);
}
