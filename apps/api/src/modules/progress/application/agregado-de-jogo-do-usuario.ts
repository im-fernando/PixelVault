import type { AgregadoDeJogoDoUsuario } from '../domain/agregado-de-jogo.js';
import { prismaUserGameRepository } from '../infrastructure/prisma-user-game-repository.js';

/**
 * Pronta para `achievements` chamar pela fachada (issue #120), mesmo desenho
 * de `descreverJogos` em `catalog` e de `contarRomsNaBiblioteca` em
 * `library`: função já amarrada ao próprio repositório, sem dependência para
 * quem chama montar.
 */
export async function agregadoDeJogoDoUsuario(userId: string): Promise<AgregadoDeJogoDoUsuario> {
  return prismaUserGameRepository.agregarParaUsuario(userId);
}
