import type { Game } from '@pixelvault/contracts';
import { NotFoundError } from '../../../infrastructure/errors.js';
import type { GameRepository } from '../domain/game-repository.js';

export async function getGameBySlug(repository: GameRepository, slug: string): Promise<Game> {
  const game = await repository.findBySlug(slug);
  if (!game) throw new NotFoundError('Jogo');
  return game;
}
