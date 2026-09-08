import { describe, expect, it } from 'vitest';
import type { SessaoDoUsuario, SessionRepository } from '../domain/session-repository.js';
import type { SessaoAtiva } from '../domain/sessao.js';
import { listarSessoes, type DependenciasDeListagem } from './listar-sessoes.js';

const AGORA = new Date('2026-09-07T12:00:00.000Z');

interface RepositorioFalso extends SessionRepository {
  podas: { userId: string; agora: Date }[];
}

function repositorioCom(sessoes: SessaoDoUsuario[]): RepositorioFalso {
  const podas: RepositorioFalso['podas'] = [];
  return {
    podas,
    async criar(): Promise<void> {},
    async buscarPorTokenHash(): Promise<SessaoAtiva | null> {
      return null;
    },
    async renovar(): Promise<void> {},
    async listarDoUsuario(): Promise<SessaoDoUsuario[]> {
      return sessoes;
    },
    async revogar(): Promise<boolean> {
      return false;
    },
    async revogarOutras(): Promise<number> {
      return 0;
    },
    async apagarExpiradas(userId: string, agora: Date): Promise<number> {
      podas.push({ userId, agora });
      return 0;
    },
  };
}

function dependencias(sessoes: RepositorioFalso): DependenciasDeListagem {
  return { sessoes, agora: () => AGORA };
}

function sessaoChamada(id: string): SessaoDoUsuario {
  return {
    id,
    userAgent: 'navegador-de-teste',
    ipTruncated: '203.0.113.0',
    createdAt: AGORA,
    lastSeenAt: AGORA,
  };
}

describe('listarSessoes', () => {
  it('marca como atual exatamente a sessão que está pedindo', async () => {
    const repositorio = repositorioCom([
      sessaoChamada('a'),
      sessaoChamada('b'),
      sessaoChamada('c'),
    ]);

    const listadas = await listarSessoes(dependencias(repositorio), 'usuario-1', 'b');

    expect(listadas.map((sessao) => [sessao.id, sessao.atual])).toEqual([
      ['a', false],
      ['b', true],
      ['c', false],
    ]);
  });

  it('poda as sessões vencidas do usuário antes de listar', async () => {
    const repositorio = repositorioCom([sessaoChamada('a')]);

    await listarSessoes(dependencias(repositorio), 'usuario-1', 'a');

    // A limpeza é por usuário, não uma varredura da tabela — ver o cabeçalho
    // do caso de uso para o porquê de ser preguiçosa e não um cron.
    expect(repositorio.podas).toEqual([{ userId: 'usuario-1', agora: AGORA }]);
  });

  it('não deixa escapar nada derivado do token', async () => {
    const repositorio = repositorioCom([sessaoChamada('a')]);

    const [listada] = await listarSessoes(dependencias(repositorio), 'usuario-1', 'a');

    expect(Object.keys(listada ?? {}).sort()).toEqual([
      'atual',
      'createdAt',
      'id',
      'ipTruncated',
      'lastSeenAt',
      'userAgent',
    ]);
  });
});
