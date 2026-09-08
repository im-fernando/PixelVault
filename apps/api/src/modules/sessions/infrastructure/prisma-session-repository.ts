import { prisma } from '@pixelvault/database';
import type {
  DadosDeAbertura,
  SessaoDoUsuario,
  SessionRepository,
} from '../domain/session-repository.js';
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

  async listarDoUsuario(userId: string): Promise<SessaoDoUsuario[]> {
    // Sem `tokenHash` no select — o que não sai do banco não vaza numa
    // serialização distraída nem num log de erro.
    return prisma.session.findMany({
      where: { userId },
      select: { id: true, userAgent: true, ipTruncated: true, createdAt: true, lastSeenAt: true },
      orderBy: { lastSeenAt: 'desc' },
    });
  },

  async revogar(id: string, userId: string): Promise<boolean> {
    // `deleteMany` e não `delete`: com o `userId` dentro do `WHERE`, apagar a
    // sessão de outra pessoa é impossível por construção, e o resultado de
    // "não existe" é idêntico ao de "não é sua" — zero linhas. `delete`
    // exigiria ler a linha antes para conferir o dono, e essa leitura é
    // justamente o que daria a alguém a chance de responder 403 e confirmar
    // que o id existe.
    const { count } = await prisma.session.deleteMany({ where: { id, userId } });
    return count > 0;
  },

  async revogarOutras(userId: string, sessaoPreservada: string): Promise<number> {
    const { count } = await prisma.session.deleteMany({
      where: { userId, id: { not: sessaoPreservada } },
    });
    return count;
  },

  async apagarExpiradas(userId: string, agora: Date): Promise<number> {
    // `lte`, não `lt`: o domínio considera vencida a sessão exatamente em
    // `expiresAt` (ver `sessaoExpirou`), e as duas bordas precisam concordar.
    const { count } = await prisma.session.deleteMany({
      where: { userId, expiresAt: { lte: agora } },
    });
    return count;
  },
};
