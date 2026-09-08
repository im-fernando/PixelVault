import { describe, expect, it } from 'vitest';
import type {
  DadosDeAbertura,
  SessaoDoUsuario,
  SessionRepository,
} from '../domain/session-repository.js';
import type { SessaoAtiva } from '../domain/sessao.js';
import { resolverSessao } from './resolver-sessao.js';

const AGORA = new Date('2026-09-07T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

interface RepositorioFalso extends SessionRepository {
  renovacoes: { id: string; expiresAt: Date; lastSeenAt: Date }[];
  revogadas: { id: string; userId: string }[];
}

function repositorioCom(sessao: SessaoAtiva | null): RepositorioFalso {
  const renovacoes: RepositorioFalso['renovacoes'] = [];
  const revogadas: RepositorioFalso['revogadas'] = [];
  return {
    renovacoes,
    revogadas,
    async criar(_dados: DadosDeAbertura): Promise<void> {},
    async buscarPorTokenHash(): Promise<SessaoAtiva | null> {
      return sessao;
    },
    async renovar(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
      renovacoes.push({ id, expiresAt, lastSeenAt });
    },
    async listarDoUsuario(): Promise<SessaoDoUsuario[]> {
      return [];
    },
    async revogar(id: string, userId: string): Promise<boolean> {
      revogadas.push({ id, userId });
      return true;
    },
    async revogarOutras(): Promise<number> {
      return 0;
    },
    async revogarTodas(): Promise<number> {
      return 0;
    },
    async apagarExpiradas(): Promise<number> {
      return 0;
    },
  };
}

function dependencias(sessoes: RepositorioFalso): {
  sessoes: RepositorioFalso;
  hashDoToken: (token: string) => string;
  agora: () => Date;
} {
  return { sessoes, hashDoToken: (token) => `hash:${token}`, agora: () => AGORA };
}

function sessaoValidaAte(expiresAt: Date): SessaoAtiva {
  return { id: 'sessao-1', userId: 'usuario-1', expiresAt };
}

describe('resolverSessao', () => {
  it('procura pelo hash do token, nunca pelo token', async () => {
    let procurado: string | null = null;
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() + 30 * DIA)));
    repositorio.buscarPorTokenHash = async (tokenHash) => {
      procurado = tokenHash;
      return sessaoValidaAte(new Date(AGORA.getTime() + 30 * DIA));
    };

    await resolverSessao(dependencias(repositorio), 'token-em-claro');

    expect(procurado).toBe('hash:token-em-claro');
  });

  it('devolve o dono da sessão sem renovar quando ainda sobra prazo', async () => {
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() + 20 * DIA)));

    const resolvida = await resolverSessao(dependencias(repositorio), 'token');

    expect(resolvida).toEqual({ sessionId: 'sessao-1', userId: 'usuario-1' });
    expect(repositorio.renovacoes).toHaveLength(0);
  });

  it('devolve qual é a sessão, e não só quem é a pessoa', async () => {
    // Sem o `sessionId`, "sair dos outros aparelhos" não teria como saber
    // qual poupar e a listagem não teria como marcar o dispositivo atual.
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() + 20 * DIA)));

    const resolvida = await resolverSessao(dependencias(repositorio), 'token');

    expect(resolvida?.sessionId).toBe('sessao-1');
  });

  it('desliza a expiração quando resta menos da metade do prazo', async () => {
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() + 10 * DIA)));

    const resolvida = await resolverSessao(dependencias(repositorio), 'token');

    const novaExpiracao = new Date(AGORA.getTime() + 30 * DIA);
    expect(resolvida).toEqual({
      sessionId: 'sessao-1',
      userId: 'usuario-1',
      renovadaAte: novaExpiracao,
    });
    expect(repositorio.renovacoes).toEqual([
      { id: 'sessao-1', expiresAt: novaExpiracao, lastSeenAt: AGORA },
    ]);
  });

  it('recusa sessão expirada sem renovar nada', async () => {
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() - 1)));

    expect(await resolverSessao(dependencias(repositorio), 'token')).toBeNull();
    expect(repositorio.renovacoes).toHaveLength(0);
  });

  it('apaga a sessão expirada em vez de só recusá-la', async () => {
    // Limpeza preguiçosa: recusar e deixar a linha no banco garantiria só que
    // ela fosse recusada de novo amanhã. Ver `listar-sessoes.ts`.
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() - 1)));

    await resolverSessao(dependencias(repositorio), 'token');

    expect(repositorio.revogadas).toEqual([{ id: 'sessao-1', userId: 'usuario-1' }]);
  });

  it('não apaga nada quando o token simplesmente não existe', async () => {
    const repositorio = repositorioCom(null);

    await resolverSessao(dependencias(repositorio), 'token');

    expect(repositorio.revogadas).toHaveLength(0);
  });

  it('recusa token que não existe', async () => {
    expect(await resolverSessao(dependencias(repositorioCom(null)), 'token')).toBeNull();
  });
});
