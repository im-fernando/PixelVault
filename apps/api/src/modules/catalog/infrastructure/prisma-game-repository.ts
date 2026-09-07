import { prisma, type Prisma } from '@pixelvault/database';
import type { Game, GameListQuery } from '@pixelvault/contracts';
import type { GameRepository } from '../domain/game-repository.js';

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

  async findBySlug(slug: string): Promise<Game | null> {
    const linha = await prisma.game.findUnique({ where: { slug }, select: CAMPOS });
    return linha ? paraDominio(linha) : null;
  },
};
