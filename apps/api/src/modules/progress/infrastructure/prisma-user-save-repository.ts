import { Prisma, prisma, type UserSave } from '@pixelvault/database';
import type { UsoDoSaveNaNuvem } from '../domain/cota.js';
import type {
  NovoSaveNaNuvem,
  ResultadoDaGravacao,
  UserSaveRepository,
} from '../domain/user-save-repository.js';
import type { SaveNaNuvem, SlotDeSaveState, TipoDeSaveNaNuvem } from '../domain/user-save.js';

function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

/** `undefined` (domínio) ↔ `-1` (banco) — ver o comentário do model `UserSave` em schema.prisma. */
const SEM_SLOT_NO_BANCO = -1;

function slotNoBanco(slot: SlotDeSaveState | undefined): number {
  return slot ?? SEM_SLOT_NO_BANCO;
}

function paraDominio(linha: UserSave): SaveNaNuvem {
  return {
    id: linha.id,
    userId: linha.userId,
    sha256: linha.sha256,
    kind: linha.kind,
    slot: linha.slot === SEM_SLOT_NO_BANCO ? null : (linha.slot as SlotDeSaveState),
    storageKey: linha.storageKey,
    sizeBytes: linha.sizeBytes,
    thumbnailKey: linha.thumbnailKey,
    thumbnailSizeBytes: linha.thumbnailSizeBytes,
    revision: linha.revision,
    updatedAt: linha.updatedAt,
  };
}

export const prismaUserSaveRepository: UserSaveRepository = {
  async buscarPorRom(
    userId: string,
    sha256: string,
    kind: TipoDeSaveNaNuvem,
    slot?: SlotDeSaveState,
  ): Promise<SaveNaNuvem | null> {
    const linha = await prisma.userSave.findUnique({
      where: { userId_sha256_kind_slot: { userId, sha256, kind, slot: slotNoBanco(slot) } },
    });
    return linha === null ? null : paraDominio(linha);
  },

  async listarPorRom(
    userId: string,
    sha256: string,
    kind: TipoDeSaveNaNuvem,
  ): Promise<SaveNaNuvem[]> {
    const linhas = await prisma.userSave.findMany({ where: { userId, sha256, kind } });
    return linhas.map(paraDominio);
  },

  async gravar(novo: NovoSaveNaNuvem): Promise<ResultadoDaGravacao> {
    const slot = slotNoBanco(novo.slot);

    if (novo.revisaoEsperada === 0) {
      try {
        const criado = await prisma.userSave.create({
          data: {
            userId: novo.userId,
            sha256: novo.sha256,
            kind: novo.kind,
            slot,
            storageKey: novo.storageKey,
            sizeBytes: novo.sizeBytes,
            thumbnailKey: novo.thumbnailKey ?? null,
            thumbnailSizeBytes: novo.thumbnailSizeBytes ?? null,
          },
        });
        return { tipo: 'gravado', save: paraDominio(criado) };
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
          novo.slot,
        );
        return { tipo: 'conflito', atual };
      }
    }

    const resultado = await prisma.userSave.updateMany({
      where: {
        userId: novo.userId,
        sha256: novo.sha256,
        kind: novo.kind,
        slot,
        revision: novo.revisaoEsperada,
      },
      data: {
        storageKey: novo.storageKey,
        sizeBytes: novo.sizeBytes,
        thumbnailKey: novo.thumbnailKey ?? null,
        thumbnailSizeBytes: novo.thumbnailSizeBytes ?? null,
        revision: { increment: 1 },
      },
    });

    if (resultado.count === 0) {
      const atual = await prismaUserSaveRepository.buscarPorRom(
        novo.userId,
        novo.sha256,
        novo.kind,
        novo.slot,
      );
      return { tipo: 'conflito', atual };
    }

    // O `updateMany` não devolve a linha; buscamos de volta para responder
    // com o `updatedAt` que o Prisma acabou de carimbar.
    const atualizado = await prismaUserSaveRepository.buscarPorRom(
      novo.userId,
      novo.sha256,
      novo.kind,
      novo.slot,
    );
    if (atualizado === null) {
      throw new Error('user_saves sumiu entre o UPDATE e a releitura — não deveria acontecer');
    }
    return { tipo: 'gravado', save: atualizado };
  },

  async medirUso(userId: string): Promise<UsoDoSaveNaNuvem> {
    // `sizeBytes` sozinho subestimaria quem tem save state: a miniatura é
    // um segundo objeto no storage, com tamanho próprio em
    // `thumbnailSizeBytes` (issue #109) — sem somar os dois, a cota nunca
    // veria o espaço que a miniatura ocupa.
    const soma = await prisma.userSave.aggregate({
      where: { userId },
      _sum: { sizeBytes: true, thumbnailSizeBytes: true },
    });
    return { bytes: (soma._sum.sizeBytes ?? 0) + (soma._sum.thumbnailSizeBytes ?? 0) };
  },
};
