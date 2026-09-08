import { prisma } from '@pixelvault/database';
import type { DadosDeAbertura, SessionRepository } from '../domain/session-repository.js';
import type { SessaoAtiva } from '../domain/sessao.js';

export const prismaSessionRepository: SessionRepository = {
  async criar(dados: DadosDeAbertura): Promise<void> {
    await prisma.session.create({
      data: {
        id: dados.id,
        userId: dados.userId,
        tokenHash: dados.tokenHash,
        expiresAt: dados.expiresAt,
        userAgent: dados.userAgent,
        ipTruncated: dados.ipTruncated,
      },
      select: { id: true },
    });
  },

  async buscarPorTokenHash(tokenHash: string): Promise<SessaoAtiva | null> {
    // `select` explícito: o hash do token não precisa sair do banco para
    // resolver a sessão, e o que não sai não vaza em log de erro.
    return prisma.session.findUnique({
      where: { tokenHash },
      select: { id: true, userId: true, expiresAt: true },
    });
  },

  async renovar(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
    await prisma.session.update({
      where: { id },
      data: { expiresAt, lastSeenAt },
      select: { id: true },
    });
  },
};
