import { prisma } from '@pixelvault/database';
import type { SaveNaNuvem, TipoDeSaveNaNuvem } from '../domain/user-save.js';
import type { UserSaveRepository } from '../domain/user-save-repository.js';

export const prismaUserSaveRepository: UserSaveRepository = {
  async buscarPorRom(
    userId: string,
    sha256: string,
    kind: TipoDeSaveNaNuvem,
  ): Promise<SaveNaNuvem | null> {
    return prisma.userSave.findUnique({
      where: { userId_sha256_kind: { userId, sha256, kind } },
    });
  },
};
