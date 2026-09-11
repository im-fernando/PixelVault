import { prisma } from '@pixelvault/database';
import type { AgregadoDeJogoDoUsuario } from '../domain/agregado-de-jogo.js';
import type { UserGameRepository } from '../domain/user-game-repository.js';

export const prismaUserGameRepository: UserGameRepository = {
  async agregarParaUsuario(userId: string): Promise<AgregadoDeJogoDoUsuario> {
    // `_count` conta as linhas (um jogo distinto por linha, `@@id([userId,
    // gameId])`); `_sum` soma o playtime que a #119 vai passar a escrever.
    // `_sum` vem nulo quando a conta não jogou nada ainda — conta sem jogo
    // é zero, não ausência, mesmo raciocínio de `medirUso` em `library`.
    const agregado = await prisma.userGame.aggregate({
      where: { userId },
      _count: { _all: true },
      _sum: { totalPlaytimeSeconds: true },
    });

    return {
      jogosDistintos: agregado._count._all,
      segundosJogados: agregado._sum.totalPlaytimeSeconds ?? 0,
    };
  },
};
