import type { EntradaDeRanking } from '../domain/ranking.js';
import { prismaUserGameRepository } from '../infrastructure/prisma-user-game-repository.js';

/**
 * Prontas para `leaderboards` chamar pela fachada (issue #122), mesmo
 * desenho de `agregadoDeJogoDoUsuario`: funções já amarradas ao próprio
 * repositório, sem dependência para quem chama montar.
 */

export async function rankingDoJogo(gameId: string, limite: number): Promise<EntradaDeRanking[]> {
  return prismaUserGameRepository.topDoRanking(gameId, limite);
}

export async function posicaoDaContaNoRanking(
  gameId: string,
  userId: string,
): Promise<EntradaDeRanking | null> {
  return prismaUserGameRepository.posicaoDaConta(gameId, userId);
}
