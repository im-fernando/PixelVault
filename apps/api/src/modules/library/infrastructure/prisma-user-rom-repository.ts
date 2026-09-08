import { prisma } from '@pixelvault/database';
import type { UsoDaBiblioteca } from '../domain/cota.js';
import type {
  NovaRomDoUsuario,
  RomDoUsuario,
  RomDoUsuarioParaDownload,
  UserRomRepository,
} from '../domain/user-rom-repository.js';

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

  async registrar(rom: NovaRomDoUsuario): Promise<RomDoUsuario> {
    // `upsert` com `update` vazio, e não `create` com tratamento de conflito:
    // concluir duas vezes o envio do mesmo conteúdo devolve a linha que já
    // existe, sem tocar nela. O que está gravado é o que a pessoa enviou
    // primeiro — nome de arquivo e `game_id` inclusive —, e sobrescrever isso
    // por causa de uma retentativa seria trocar o dado bom pelo repetido.
    return prisma.userRom.upsert({
      where: { userId_sha256: { userId: rom.userId, sha256: rom.sha256 } },
      create: {
        userId: rom.userId,
        sha256: rom.sha256,
        storageKey: rom.storageKey,
        sizeBytes: rom.sizeBytes,
        fileName: rom.fileName,
        gameId: rom.gameId,
      },
      update: {},
      select: { id: true, sha256: true },
    });
  },

  async buscarPorId(id: string): Promise<RomDoUsuarioParaDownload | null> {
    // O `userId` sai no `select` porque é ele que a autorização compara — sem
    // ele, quem chama só saberia que a linha existe, que é exatamente a
    // pergunta errada. A `storageKey` vem junto e para aqui: ela é assinada no
    // caso de uso e nunca entra na resposta HTTP.
    return prisma.userRom.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        sha256: true,
        storageKey: true,
        sizeBytes: true,
        fileName: true,
      },
    });
  },

  async medirUso(userId: string): Promise<UsoDaBiblioteca> {
    // Um `SUM` e um `COUNT` na mesma consulta, sobre o índice de `user_id`:
    // nenhuma linha sai do banco para o processo. `_sum` vem nulo quando a
    // pessoa não tem ROM nenhuma — biblioteca vazia é zero, não ausência.
    const agregado = await prisma.userRom.aggregate({
      where: { userId },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    });

    return { bytes: agregado._sum.sizeBytes ?? 0, quantidade: agregado._count._all };
  },
};
