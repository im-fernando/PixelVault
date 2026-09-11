import { prisma } from '@pixelvault/database';
import { calcularCreditoDoHeartbeat } from '../domain/heartbeat.js';
import type { AgregadoDeJogoDoUsuario } from '../domain/agregado-de-jogo.js';
import type { CreditoDeHeartbeat, UserGameRepository } from '../domain/user-game-repository.js';

export const prismaUserGameRepository: UserGameRepository = {
  async creditarHeartbeat(
    userId: string,
    gameId: string,
    tetoSegundos: number,
  ): Promise<CreditoDeHeartbeat> {
    return prisma.$transaction(async (tx) => {
      /*
       * `update: { totalPlaytimeSeconds: { increment: 0 } }`, e não
       * `update: {}`: o efeito que interessa aqui não é o valor (soma zero,
       * não muda nada), é o `UPDATE` de verdade que a instrução SQL gera. É
       * ele que pede o lock de linha do Postgres — mantido até o fim desta
       * transação — e é esse lock que serializa duas abas da mesma conta
       * heartbeando o mesmo jogo ao mesmo tempo: a segunda `upsert` espera a
       * primeira transação inteira terminar antes de seguir, e só então lê o
       * `lastPlayedAt` que a primeira já avançou. Sem um `SET` real no ramo
       * de conflito, o Postgres não teria garantia de tomar o lock aqui.
       * É a mesma peça (Postgres, sem Redis) que a ADR 0019 já usa para
       * contador compartilhado entre instâncias — ver docs/adr/0009, decisão
       * 2, para o raciocínio completo de por que isto basta contra abas
       * múltiplas.
       */
      await tx.userGame.upsert({
        where: { userId_gameId: { userId, gameId } },
        create: { userId, gameId },
        update: { totalPlaytimeSeconds: { increment: 0 } },
      });

      const atual = await tx.userGame.findUniqueOrThrow({
        where: { userId_gameId: { userId, gameId } },
      });

      const agora = new Date();
      const segundosCreditados = calcularCreditoDoHeartbeat(
        atual.lastPlayedAt,
        agora,
        tetoSegundos,
      );

      const atualizado = await tx.userGame.update({
        where: { userId_gameId: { userId, gameId } },
        data: {
          totalPlaytimeSeconds: { increment: segundosCreditados },
          lastPlayedAt: agora,
        },
      });

      return {
        segundosCreditados,
        totalPlaytimeSeconds: atualizado.totalPlaytimeSeconds,
      };
    });
  },

  async agregarParaUsuario(userId: string): Promise<AgregadoDeJogoDoUsuario> {
    // `_count` conta as linhas (um jogo distinto por linha, `@@id([userId,
    // gameId])`); `_sum` soma o playtime que `creditarHeartbeat` escreve.
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
