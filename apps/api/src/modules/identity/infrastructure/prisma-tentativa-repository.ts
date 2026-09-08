import { prisma } from '@pixelvault/database';
import type { EscopoDeTentativa } from '../domain/limite-de-tentativas.js';
import type {
  ChaveDeTentativa,
  TentativaAGravar,
  TentativaRegistrada,
  TentativaRepository,
} from '../domain/tentativa-repository.js';

export const prismaTentativaRepository: TentativaRepository = {
  async listarDesde(
    escopo: EscopoDeTentativa,
    chaves: ChaveDeTentativa[],
    desde: Date,
  ): Promise<TentativaRegistrada[]> {
    // `select` sem `keyHash`: a política não compara chave nenhuma, só conta
    // e olha o relógio — e o que não sai do banco não vaza em log de erro.
    const linhas = await prisma.authAttempt.findMany({
      where: {
        scope: escopo,
        createdAt: { gt: desde },
        OR: chaves.map((chave) => ({ keyType: chave.tipo, keyHash: chave.hash })),
      },
      select: { keyType: true, createdAt: true },
    });

    return linhas.map((linha) => ({ tipo: linha.keyType, em: linha.createdAt }));
  },

  async registrar(escopo: EscopoDeTentativa, tentativas: TentativaAGravar[]): Promise<void> {
    await prisma.authAttempt.createMany({
      data: tentativas.map((tentativa) => ({
        id: tentativa.id,
        scope: escopo,
        keyType: tentativa.chave.tipo,
        keyHash: tentativa.chave.hash,
      })),
    });
  },

  async apagar(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    await prisma.authAttempt.deleteMany({ where: { id: { in: ids } } });
  },

  async esquecer(escopo: EscopoDeTentativa, chave: ChaveDeTentativa): Promise<void> {
    await prisma.authAttempt.deleteMany({
      where: { scope: escopo, keyType: chave.tipo, keyHash: chave.hash },
    });
  },

  async podarAnterioresA(momento: Date): Promise<number> {
    // Varre pelo índice de `created_at` e, no caso comum (nada velho o
    // bastante), custa uma sondagem de índice.
    const { count } = await prisma.authAttempt.deleteMany({
      where: { createdAt: { lt: momento } },
    });
    return count;
  },
};
