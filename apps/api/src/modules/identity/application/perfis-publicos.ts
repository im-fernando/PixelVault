import type { PerfilPublico } from '../domain/user-repository.js';
import { prismaUserRepository } from '../infrastructure/prisma-user-repository.js';

/**
 * Pronta para `leaderboards` chamar pela fachada (issue #122), mesmo desenho
 * de `descreverJogos` em `catalog`: função já amarrada ao próprio
 * repositório, sem dependência para quem chama montar.
 */
export async function perfisPublicosPorIds(ids: readonly string[]): Promise<PerfilPublico[]> {
  return prismaUserRepository.perfisPublicosPorIds(ids);
}
