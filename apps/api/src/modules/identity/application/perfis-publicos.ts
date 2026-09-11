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

/**
 * O mesmo perfil público, achado pelo `handle` — para o perfil público em
 * si (`GET /api/profiles/:handle`, issue #123), que chega com o handle da
 * URL, não com um `userId` em mãos. `null` quando não existe conta com esse
 * handle.
 */
export async function perfilPublicoPorHandle(handle: string): Promise<PerfilPublico | null> {
  return prismaUserRepository.perfilPublicoPorHandle(handle);
}
