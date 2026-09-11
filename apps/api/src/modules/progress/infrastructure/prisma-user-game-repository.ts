import { prisma } from '@pixelvault/database';
import { calcularCreditoDoHeartbeat } from '../domain/heartbeat.js';
import type { AgregadoDeJogoDoUsuario } from '../domain/agregado-de-jogo.js';
import { calcularPosicoes } from '../domain/ranking.js';
import type { EntradaDeRanking } from '../domain/ranking.js';
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

  async topDoRanking(gameId: string, limite: number): Promise<EntradaDeRanking[]> {
    // `@@index([gameId, totalPlaytimeSeconds])` (schema.prisma) é o que faz
    // este `ORDER BY` + `LIMIT` não varrer `user_games` inteira a cada
    // chamada — a mesma disciplina de índice que `medirUso` já segue em
    // `library`/`progress` para a cota.
    const linhas = await prisma.userGame.findMany({
      where: { gameId },
      orderBy: { totalPlaytimeSeconds: 'desc' },
      take: limite,
      select: { userId: true, totalPlaytimeSeconds: true },
    });

    // `calcularPosicoes` é quem decide empate — a lista já chega ordenada,
    // então a função pura só numera; ver o comentário dela para o porquê de
    // ser RANK() e não ROW_NUMBER().
    return calcularPosicoes(linhas);
  },

  async posicaoDaConta(gameId: string, userId: string): Promise<EntradaDeRanking | null> {
    const minha = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId, gameId } },
      select: { totalPlaytimeSeconds: true },
    });
    if (minha === null) return null;

    // A posição é "quantas contas jogaram MAIS que eu, mais um" — a mesma
    // aritmética de RANK() do SQL, só que como um COUNT sobre o índice
    // `[gameId, totalPlaytimeSeconds]`, sem trazer a tabela inteira para
    // numerar em memória (que é o que `topDoRanking` faz, mas ali o
    // `LIMIT` já corta o tamanho do que se traz).
    const contasComMaisTempo = await prisma.userGame.count({
      where: { gameId, totalPlaytimeSeconds: { gt: minha.totalPlaytimeSeconds } },
    });

    return {
      userId,
      totalPlaytimeSeconds: minha.totalPlaytimeSeconds,
      posicao: contasComMaisTempo + 1,
    };
  },
};
