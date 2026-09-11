import { Prisma, prisma } from '@pixelvault/database';
import type {
  ConquistaDesbloqueadaRepository,
  ResultadoDoDesbloqueio,
} from '../domain/conquista-desbloqueada-repository.js';
import type { CodigoDeConquista, ConquistaDesbloqueada } from '../domain/conquista-desbloqueada.js';

/** Mesmo padrão de `progress/infrastructure/prisma-user-save-repository.ts`. */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  return erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002';
}

export const prismaConquistaDesbloqueadaRepository: ConquistaDesbloqueadaRepository = {
  async desbloquear(userId: string, code: CodigoDeConquista): Promise<ResultadoDoDesbloqueio> {
    try {
      await prisma.userAchievement.create({ data: { userId, code } });
      return { novaConquista: true };
    } catch (erro) {
      if (!ehViolacaoDeUnicidade(erro)) throw erro;

      // `@@unique([userId, code])` recusou: a conta já tinha esta conquista.
      // Não é conflito a reportar — é o "de novo" do critério de aceite, e a
      // resposta certa é dizer que não houve novidade, sem erro nenhum.
      return { novaConquista: false };
    }
  },

  async listar(userId: string): Promise<ConquistaDesbloqueada[]> {
    const linhas = await prisma.userAchievement.findMany({
      where: { userId },
      orderBy: { unlockedAt: 'asc' },
    });
    return linhas.map((linha) => ({
      userId: linha.userId,
      code: linha.code,
      unlockedAt: linha.unlockedAt,
    }));
  },

  async quaisJaTem(
    userId: string,
    codes: readonly CodigoDeConquista[],
  ): Promise<Set<CodigoDeConquista>> {
    if (codes.length === 0) return new Set();

    const linhas = await prisma.userAchievement.findMany({
      where: { userId, code: { in: [...codes] } },
      select: { code: true },
    });
    return new Set(linhas.map((linha) => linha.code));
  },
};
