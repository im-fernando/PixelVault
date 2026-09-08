import { prisma, type Prisma } from '@pixelvault/database';
import type { Game, GameDetail, GameListQuery, HomebrewRom } from '@pixelvault/contracts';
import type { JogoSemCapa } from '../domain/busca-de-capa.js';
import type { FichaDeJogo, GameRepository, RomDoCatalogo } from '../domain/game-repository.js';

type LinhaJogo = {
  id: string;
  systemId: Game['systemId'];
  title: string;
  slug: string;
  releaseYear: number | null;
  publisher: string | null;
  coverUrl: string | null;
  isHomebrew: boolean;
};

type LinhaRom = {
  sha256: string;
  storageKey: string | null;
  sizeBytes: number | null;
};

function paraDominio(linha: LinhaJogo): Game {
  return {
    id: linha.id,
    systemId: linha.systemId,
    title: linha.title,
    slug: linha.slug,
    releaseYear: linha.releaseYear,
    publisher: linha.publisher,
    coverUrl: linha.coverUrl,
    isHomebrew: linha.isHomebrew,
  };
}

const CAMPOS = {
  id: true,
  systemId: true,
  title: true,
  slug: true,
  releaseYear: true,
  publisher: true,
  coverUrl: true,
  isHomebrew: true,
} as const;

const CAMPOS_DA_ROM = { sha256: true, storageKey: true, sizeBytes: true } as const;

/**
 * A `storage_key` do homebrew é relativa à raiz pública do front
 * (`roms/<slug>/<slug>.sfc`), porque é o front que serve o arquivo. Quem
 * consome precisa de um caminho absoluto a partir da raiz do site, e essa
 * tradução é adaptação de persistência — por isso mora aqui, e não no cliente
 * concatenando string.
 */
function paraRomDeHomebrew(linha: LinhaRom): HomebrewRom | null {
  const chave = linha.storageKey;
  if (chave === null || chave.length === 0) return null;

  const caminho = chave.startsWith('/') ? chave : `/${chave}`;
  const nomeDoArquivo = caminho.slice(caminho.lastIndexOf('/') + 1);
  if (nomeDoArquivo.length === 0) return null;

  return {
    url: caminho,
    fileName: nomeDoArquivo,
    sha256: linha.sha256,
    sizeBytes: linha.sizeBytes,
  };
}

export const prismaGameRepository: GameRepository = {
  async list(query: GameListQuery): Promise<Game[]> {
    const where: Prisma.GameWhereInput = {};
    if (query.systemId) where.systemId = query.systemId;
    if (query.homebrewOnly) where.isHomebrew = true;
    if (query.search) where.title = { contains: query.search, mode: 'insensitive' };

    const linhas = await prisma.game.findMany({
      where,
      select: CAMPOS,
      orderBy: { title: 'asc' },
      take: 100,
    });

    return linhas.map(paraDominio);
  },

  async findBySlug(slug: string): Promise<GameDetail | null> {
    const linha = await prisma.game.findUnique({
      where: { slug },
      select: {
        ...CAMPOS,
        // A ROM só é buscada para homebrew. Não é otimização: `storage_key` de
        // um jogo comercial nunca deveria estar preenchida, e um filtro que
        // depende só da coluna transformaria um dado errado no banco em ROM
        // comercial servida ao público. Ver docs/adr/0006.
        roms: {
          where: { storageKey: { not: null }, game: { isHomebrew: true } },
          select: CAMPOS_DA_ROM,
          orderBy: { sha256: 'asc' },
          take: 1,
        },
      },
    });
    if (!linha) return null;

    const rom = linha.roms[0];
    return {
      ...paraDominio(linha),
      homebrewRom: rom === undefined ? null : paraRomDeHomebrew(rom),
    };
  },

  async identificarRomPorHash(hashes: readonly string[]): Promise<RomDoCatalogo | null> {
    if (hashes.length === 0) return null;

    // `sha256` é `@unique` global em `game_roms`, então "primeiro que casar" é
    // determinístico mesmo com os dois hashes na consulta: no máximo um deles
    // existe na tabela. Um `findFirst` com `in` é um acerto de índice, e não
    // duas consultas em sequência.
    const linha = await prisma.gameRom.findFirst({
      where: { sha256: { in: [...hashes] } },
      select: { gameId: true },
    });

    return linha === null ? null : { gameId: linha.gameId };
  },

  async descreverJogos(gameIds: readonly string[]): Promise<FichaDeJogo[]> {
    if (gameIds.length === 0) return [];

    // O `Set` porque a mesma pessoa pode ter duas ROMs do mesmo jogo — a
    // versão americana e a japonesa são conteúdos diferentes, com linhas
    // diferentes em `user_roms` e o mesmo `game_id`. Repetido dentro de um
    // `IN` é trabalho que o banco faz à toa, como em `identificarRomPorHash`.
    const linhas = await prisma.game.findMany({
      where: { id: { in: [...new Set(gameIds)] } },
      select: { id: true, title: true, systemId: true, coverUrl: true },
    });

    return linhas.map((linha) => ({
      gameId: linha.id,
      title: linha.title,
      systemId: linha.systemId,
      coverUrl: linha.coverUrl,
    }));
  },

  async jogoSemCapa(gameId: string): Promise<JogoSemCapa | null> {
    // Os três motivos de "não há o que procurar" estão no `where`, e é ele
    // quem responde: jogo inexistente, jogo com capa e homebrew (ADR 0016)
    // saem daqui como a mesma linha ausente. Decidir isso no `where` em vez de
    // com `if` depois da leitura é o que impede o caso de homebrew de ser
    // esquecido por quem mexer nisto depois.
    const linha = await prisma.game.findFirst({
      where: { id: gameId, coverUrl: null, isHomebrew: false },
      select: { systemId: true, title: true },
    });

    return linha === null ? null : { systemId: linha.systemId, title: linha.title };
  },

  async definirCapa(gameId: string, coverUrl: string): Promise<void> {
    // `updateMany` porque a condição não é só a chave primária: `coverUrl:
    // null` faz parte dela. Com `update` o Prisma exigiria um `where` único e
    // a capa de quem chegou primeiro seria sobrescrita pela de quem chegou
    // depois. Nenhuma linha afetada é resultado normal, não erro.
    await prisma.game.updateMany({
      where: { id: gameId, coverUrl: null },
      data: { coverUrl },
    });
  },
};
