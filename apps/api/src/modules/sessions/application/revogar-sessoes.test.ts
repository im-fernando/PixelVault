import { describe, expect, it } from 'vitest';
import type { SessaoDoUsuario, SessionRepository } from '../domain/session-repository.js';
import type { SessaoAtiva } from '../domain/sessao.js';
import { revogarOutrasSessoes, revogarSessao } from './revogar-sessoes.js';

interface RepositorioFalso extends SessionRepository {
  revogacoes: { id: string; userId: string }[];
  revogacoesEmMassa: { userId: string; sessaoPreservada: string }[];
}

/** `donos` é o banco: qual usuário é dono de cada sessão existente. */
function repositorioCom(donos: Record<string, string>): RepositorioFalso {
  const revogacoes: RepositorioFalso['revogacoes'] = [];
  const revogacoesEmMassa: RepositorioFalso['revogacoesEmMassa'] = [];
  return {
    revogacoes,
    revogacoesEmMassa,
    async criar(): Promise<void> {},
    async buscarPorTokenHash(): Promise<SessaoAtiva | null> {
      return null;
    },
    async renovar(): Promise<void> {},
    async listarDoUsuario(): Promise<SessaoDoUsuario[]> {
      return [];
    },
    async revogar(id: string, userId: string): Promise<boolean> {
      revogacoes.push({ id, userId });
      // O falso imita o `deleteMany` de verdade: id e dono no mesmo filtro.
      return donos[id] === userId;
    },
    async revogarOutras(userId: string, sessaoPreservada: string): Promise<number> {
      revogacoesEmMassa.push({ userId, sessaoPreservada });
      return Object.entries(donos).filter(
        ([id, dono]) => dono === userId && id !== sessaoPreservada,
      ).length;
    },
    async apagarExpiradas(): Promise<number> {
      return 0;
    },
  };
}

describe('revogarSessao', () => {
  it('leva o dono para dentro da consulta em vez de conferir depois', async () => {
    // É aqui que mora a garantia de não vazar "esse id existe": o `userId` vai
    // junto do `id` para o repositório, então nunca existe, em lugar nenhum do
    // fluxo, a informação "existe mas é de outra pessoa" para alguém
    // transformar num 403.
    const repositorio = repositorioCom({ 'sessao-alheia': 'outro-usuario' });

    await revogarSessao({ sessoes: repositorio }, 'usuario-1', 'sessao-alheia');

    expect(repositorio.revogacoes).toEqual([{ id: 'sessao-alheia', userId: 'usuario-1' }]);
  });

  it('responde igual para sessão de outro dono e para id que não existe', async () => {
    const repositorio = repositorioCom({ 'sessao-alheia': 'outro-usuario' });

    const alheia = await revogarSessao({ sessoes: repositorio }, 'usuario-1', 'sessao-alheia');
    const inexistente = await revogarSessao({ sessoes: repositorio }, 'usuario-1', 'nao-existe');

    expect(alheia).toBe(false);
    expect(inexistente).toBe(false);
  });

  it('revoga a sessão de quem é dono dela', async () => {
    const repositorio = repositorioCom({ minha: 'usuario-1' });

    expect(await revogarSessao({ sessoes: repositorio }, 'usuario-1', 'minha')).toBe(true);
  });
});

describe('revogarOutrasSessoes', () => {
  it('preserva a sessão que pediu e devolve quantas caíram', async () => {
    const repositorio = repositorioCom({
      a: 'usuario-1',
      b: 'usuario-1',
      c: 'usuario-1',
      alheia: 'outro-usuario',
    });

    const caidas = await revogarOutrasSessoes({ sessoes: repositorio }, 'usuario-1', 'b');

    expect(caidas).toBe(2);
    expect(repositorio.revogacoesEmMassa).toEqual([{ userId: 'usuario-1', sessaoPreservada: 'b' }]);
  });
});
