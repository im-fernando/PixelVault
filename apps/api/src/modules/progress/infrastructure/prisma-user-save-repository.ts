import { Prisma, prisma } from '@pixelvault/database';
import type { UsoDoSaveNaNuvem } from '../domain/cota.js';
import type {
  NovoSaveNaNuvem,
  ResultadoDaGravacao,
  UserSaveRepository,
} from '../domain/user-save-repository.js';
import type { SaveNaNuvem, TipoDeSaveNaNuvem } from '../domain/user-save.js';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

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

  async gravar(novo: NovoSaveNaNuvem): Promise<ResultadoDaGravacao> {
    if (novo.revisaoEsperada === 0) {
      try {
        const criado = await prisma.userSave.create({
          data: {
            userId: novo.userId,
            sha256: novo.sha256,
            kind: novo.kind,
            storageKey: novo.storageKey,
            sizeBytes: novo.sizeBytes,
          },
        });
        return { tipo: 'gravado', save: criado };
      } catch (erro) {
        if (!ehViolacaoDeUnicidade(erro)) throw erro;

        // Alguém criou a linha entre a checagem do caso de uso e este
        // `create` — a mesma corrida que o `UPDATE` condicional abaixo
        // resolve para revisão não-zero. `atual` não pode dar `null` aqui: a
        // constraint só recusa porque a linha já existe.
        const atual = await prismaUserSaveRepository.buscarPorRom(
          novo.userId,
          novo.sha256,
          novo.kind,
        );
        return { tipo: 'conflito', atual };
      }
    }

    const resultado = await prisma.userSave.updateMany({
      where: {
        userId: novo.userId,
        sha256: novo.sha256,
        kind: novo.kind,
        revision: novo.revisaoEsperada,
      },
      data: {
        storageKey: novo.storageKey,
        sizeBytes: novo.sizeBytes,
        revision: { increment: 1 },
      },
    });

    if (resultado.count === 0) {
      const atual = await prismaUserSaveRepository.buscarPorRom(
        novo.userId,
        novo.sha256,
        novo.kind,
      );
      return { tipo: 'conflito', atual };
    }

    // O `updateMany` não devolve a linha; buscamos de volta para responder
    // com o `updatedAt` que o Prisma acabou de carimbar.
    const atualizado = await prismaUserSaveRepository.buscarPorRom(
      novo.userId,
      novo.sha256,
      novo.kind,
    );
    if (atualizado === null) {
      throw new Error('user_saves sumiu entre o UPDATE e a releitura — não deveria acontecer');
    }
    return { tipo: 'gravado', save: atualizado };
  },

  async medirUso(userId: string): Promise<UsoDoSaveNaNuvem> {
    const soma = await prisma.userSave.aggregate({
      where: { userId },
      _sum: { sizeBytes: true },
    });
    return { bytes: soma._sum.sizeBytes ?? 0 };
  },
};
