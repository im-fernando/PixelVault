import { prisma } from '@pixelvault/database';
import type { RomDoUsuario, UserRomRepository } from '../domain/user-rom-repository.js';

export const prismaUserRomRepository: UserRomRepository = {
  async buscarPorHash(userId: string, sha256: string): Promise<RomDoUsuario | null> {
    // `@@unique([userId, sha256])` existe desde a M0, então isto é um acerto
    // de índice, não uma varredura. O `select` é explícito: a chave do objeto
    // no storage não precisa sair do banco para responder "você já tem esse",
    // e o que não sai não vaza em log de erro.
    return prisma.userRom.findUnique({
      where: { userId_sha256: { userId, sha256 } },
      select: { id: true, sha256: true },
    });
  },
};
