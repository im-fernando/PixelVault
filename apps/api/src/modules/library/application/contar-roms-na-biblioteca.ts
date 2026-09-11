import { prismaUserRomRepository } from '../infrastructure/prisma-user-rom-repository.js';

/**
 * Quanto a biblioteca de alguém tem, para quem pergunta pela fachada — a
 * issue #120 (`achievements`) é a primeira. Mesmo desenho de
 * `descreverJogos` em `catalog`: função pronta, já amarrada ao repositório
 * do próprio módulo, para quem chama não montar dependência nenhuma.
 */
export async function contarRomsNaBiblioteca(userId: string): Promise<number> {
  return prismaUserRomRepository.contar(userId);
}
