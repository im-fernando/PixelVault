import { prisma } from '@pixelvault/database';
import type { UsoDaBiblioteca } from '../domain/cota.js';
import type {
  NovaRomDoUsuario,
  ReferenciaRemovida,
  RomDoUsuario,
  RomDoUsuarioParaDownload,
  RomNaBiblioteca,
  RomSemJogoReconhecido,
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
        gameId: true,
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

  async contar(userId: string): Promise<number> {
    return prisma.userRom.count({ where: { userId } });
  },

  async listar(userId: string): Promise<RomNaBiblioteca[]> {
    // Sem `take`: a cota já é o teto (`COTA_DE_ROMS_POR_CONTA`), e um limite a
    // mais aqui esconderia parte da biblioteca de quem chegou perto dele — sem
    // que nada na resposta dissesse que faltava coisa.
    return prisma.userRom.findMany({
      where: { userId },
      select: {
        id: true,
        gameId: true,
        sha256: true,
        sizeBytes: true,
        fileName: true,
        isFavorite: true,
        uploadedAt: true,
      },
      // Favorito na frente, e dentro de cada grupo o mais recente primeiro: é
      // a ordem da estante, e ela sai daqui para não ser reinventada por cada
      // tela que listar a biblioteca.
      orderBy: [{ isFavorite: 'desc' }, { uploadedAt: 'desc' }],
    });
  },

  async apagarReferencia(romId: string, sha256: string): Promise<ReferenciaRemovida> {
    return prisma.$transaction(async (tx) => {
      // `deleteMany` e não `delete`: a linha pode ter sumido entre a busca que
      // autorizou a remoção e esta chamada — dois cliques, duas abas. `delete`
      // estouraria um P2025 e viraria 500 num caso em que o estado desejado já
      // aconteceu.
      const { count } = await tx.userRom.deleteMany({ where: { id: romId } });
      const restantes = await tx.userRom.count({ where: { sha256 } });

      return { ultimaReferencia: count > 0 && restantes === 0 };
    });
  },

  async definirFavorito(romId: string, favorito: boolean): Promise<void> {
    // `updateMany` pelo mesmo motivo do `deleteMany` acima: a linha pode ter
    // sido removida entre a busca que autorizou e esta chamada, e nenhuma
    // linha afetada é resultado normal — não erro.
    await prisma.userRom.updateMany({ where: { id: romId }, data: { isFavorite: favorito } });
  },

  async listarSemJogoReconhecido(): Promise<RomSemJogoReconhecido[]> {
    // Sem `where` por `userId`: é a varredura global da issue #114, e o
    // índice de `game_id` (implícito no `@@index([gameId])`) cobre o filtro
    // por nulo também.
    return prisma.userRom.findMany({ where: { gameId: null }, select: { id: true, sha256: true } });
  },

  async atualizarJogoReconhecido(romId: string, gameId: string): Promise<void> {
    // `updateMany` com `gameId: null` na cláusula, não um `if` antes do
    // `update`: é a mesma guarda de corrida que `definirCapa` faz no
    // `catalog`, só que aqui contra o upload que reconheceu a mesma ROM
    // primeiro.
    await prisma.userRom.updateMany({ where: { id: romId, gameId: null }, data: { gameId } });
  },
};
