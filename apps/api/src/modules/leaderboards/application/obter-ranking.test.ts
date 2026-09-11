import { describe, expect, it } from 'vitest';
import type { EntradaDeRanking, PerfilPublico } from '../domain/portas.js';
import { obterRankingDoJogo, type DependenciasDoRanking } from './obter-ranking.js';

const GAME_ID = 'jogo-1';

const PERFIS: PerfilPublico[] = [
  { userId: 'u1', handle: 'primeiro', displayName: 'Primeiro Colocado' },
  { userId: 'u2', handle: 'segundo', displayName: 'Segundo Colocado' },
  { userId: 'u3', handle: 'ultimo', displayName: 'Fora Do Top' },
];

function depsComRanking(
  top: EntradaDeRanking[],
  posicaoDaConta: EntradaDeRanking | null,
): DependenciasDoRanking {
  return {
    obterRanking: async () => top,
    obterPosicaoDaConta: async () => posicaoDaConta,
    obterPerfis: async (ids) => PERFIS.filter((perfil) => ids.includes(perfil.userId)),
  };
}

describe('obterRankingDoJogo', () => {
  it('devolve o top na ordem que progress mandou, com handle e nome do identity', async () => {
    const top: EntradaDeRanking[] = [
      { userId: 'u1', totalPlaytimeSeconds: 300, posicao: 1 },
      { userId: 'u2', totalPlaytimeSeconds: 200, posicao: 2 },
    ];
    const deps = depsComRanking(top, { userId: 'u1', totalPlaytimeSeconds: 300, posicao: 1 });

    const resultado = await obterRankingDoJogo(deps, GAME_ID, 'u1', 10);

    expect(resultado.top).toEqual([
      {
        userId: 'u1',
        handle: 'primeiro',
        displayName: 'Primeiro Colocado',
        totalPlaytimeSeconds: 300,
        posicao: 1,
      },
      {
        userId: 'u2',
        handle: 'segundo',
        displayName: 'Segundo Colocado',
        totalPlaytimeSeconds: 200,
        posicao: 2,
      },
    ]);
  });

  it('inclui a própria posição mesmo quando a conta está fora do top', async () => {
    const top: EntradaDeRanking[] = [
      { userId: 'u1', totalPlaytimeSeconds: 300, posicao: 1 },
      { userId: 'u2', totalPlaytimeSeconds: 200, posicao: 2 },
    ];
    const minhaEntrada: EntradaDeRanking = { userId: 'u3', totalPlaytimeSeconds: 10, posicao: 7 };
    const deps = depsComRanking(top, minhaEntrada);

    const resultado = await obterRankingDoJogo(deps, GAME_ID, 'u3', 2);

    expect(resultado.top).toHaveLength(2);
    expect(resultado.top.some((linha) => linha.userId === 'u3')).toBe(false);
    expect(resultado.minhaPosicao).toEqual({
      userId: 'u3',
      handle: 'ultimo',
      displayName: 'Fora Do Top',
      totalPlaytimeSeconds: 10,
      posicao: 7,
    });
  });

  it('devolve minhaPosicao nula quando a conta nunca jogou aquele jogo', async () => {
    const deps = depsComRanking([{ userId: 'u1', totalPlaytimeSeconds: 300, posicao: 1 }], null);

    const resultado = await obterRankingDoJogo(deps, GAME_ID, 'u-sem-playtime', 10);

    expect(resultado.minhaPosicao).toBeNull();
  });

  it('pergunta os perfis uma vez só, com os ids do top e o da própria conta juntos', async () => {
    const idsPerguntados: string[][] = [];
    const deps: DependenciasDoRanking = {
      obterRanking: async () => [{ userId: 'u1', totalPlaytimeSeconds: 300, posicao: 1 }],
      obterPosicaoDaConta: async () => ({ userId: 'u3', totalPlaytimeSeconds: 10, posicao: 7 }),
      obterPerfis: async (ids) => {
        idsPerguntados.push([...ids]);
        return PERFIS.filter((perfil) => ids.includes(perfil.userId));
      },
    };

    await obterRankingDoJogo(deps, GAME_ID, 'u3', 10);

    expect(idsPerguntados).toHaveLength(1);
    expect(new Set(idsPerguntados[0])).toEqual(new Set(['u1', 'u3']));
  });

  it('descarta uma linha cujo perfil não existe mais, em vez de sair com handle vazio', async () => {
    const deps = depsComRanking(
      [{ userId: 'conta-apagada', totalPlaytimeSeconds: 300, posicao: 1 }],
      null,
    );

    const resultado = await obterRankingDoJogo(deps, GAME_ID, 'u3', 10);

    expect(resultado.top).toEqual([]);
  });
});
