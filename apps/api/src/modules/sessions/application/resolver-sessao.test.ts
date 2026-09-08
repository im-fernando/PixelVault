import { describe, expect, it } from 'vitest';
import type { DadosDeAbertura, SessionRepository } from '../domain/session-repository.js';
import type { SessaoAtiva } from '../domain/sessao.js';
import { resolverSessao } from './resolver-sessao.js';

const AGORA = new Date('2026-09-07T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

interface RepositorioFalso extends SessionRepository {
  renovacoes: { id: string; expiresAt: Date; lastSeenAt: Date }[];
}

function repositorioCom(sessao: SessaoAtiva | null): RepositorioFalso {
  const renovacoes: RepositorioFalso['renovacoes'] = [];
  return {
    renovacoes,
    async criar(_dados: DadosDeAbertura): Promise<void> {},
    async buscarPorTokenHash(): Promise<SessaoAtiva | null> {
      return sessao;
    },
    async renovar(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void> {
      renovacoes.push({ id, expiresAt, lastSeenAt });
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

    expect(resolvida).toEqual({ userId: 'usuario-1' });
    expect(repositorio.renovacoes).toHaveLength(0);
  });

  it('desliza a expiração quando resta menos da metade do prazo', async () => {
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() + 10 * DIA)));

    const resolvida = await resolverSessao(dependencias(repositorio), 'token');

    const novaExpiracao = new Date(AGORA.getTime() + 30 * DIA);
    expect(resolvida).toEqual({ userId: 'usuario-1', renovadaAte: novaExpiracao });
    expect(repositorio.renovacoes).toEqual([
      { id: 'sessao-1', expiresAt: novaExpiracao, lastSeenAt: AGORA },
    ]);
  });

  it('recusa sessão expirada sem renovar nada', async () => {
    const repositorio = repositorioCom(sessaoValidaAte(new Date(AGORA.getTime() - 1)));

    expect(await resolverSessao(dependencias(repositorio), 'token')).toBeNull();
    expect(repositorio.renovacoes).toHaveLength(0);
  });

  it('recusa token que não existe', async () => {
    expect(await resolverSessao(dependencias(repositorioCom(null)), 'token')).toBeNull();
  });
});
