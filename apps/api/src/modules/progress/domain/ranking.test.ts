import { describe, expect, it } from 'vitest';
import { calcularPosicoes } from './ranking.js';

describe('calcularPosicoes', () => {
  it('numera sequencialmente quando não há empate', () => {
    const posicoes = calcularPosicoes([
      { userId: 'a', totalPlaytimeSeconds: 300 },
      { userId: 'b', totalPlaytimeSeconds: 200 },
      { userId: 'c', totalPlaytimeSeconds: 100 },
    ]);

    expect(posicoes.map((p) => p.posicao)).toEqual([1, 2, 3]);
  });

  it('empata na mesma posição contas com o mesmo total, e a próxima pula o número de empatados', () => {
    const posicoes = calcularPosicoes([
      { userId: 'a', totalPlaytimeSeconds: 300 },
      { userId: 'b', totalPlaytimeSeconds: 200 },
      { userId: 'c', totalPlaytimeSeconds: 200 },
      { userId: 'd', totalPlaytimeSeconds: 100 },
    ]);

    // b e c empatam na posição 2; d não é o "4º", cai na posição 4 mesmo
    // assim (estilo RANK(), não ROW_NUMBER()) — não existe posição 3 aqui.
    expect(posicoes.map((p) => p.posicao)).toEqual([1, 2, 2, 4]);
  });

  it('devolve lista vazia para lista vazia', () => {
    expect(calcularPosicoes([])).toEqual([]);
  });

  it('dá a mesma posição a todo mundo quando todo mundo empata', () => {
    const posicoes = calcularPosicoes([
      { userId: 'a', totalPlaytimeSeconds: 100 },
      { userId: 'b', totalPlaytimeSeconds: 100 },
    ]);

    expect(posicoes.map((p) => p.posicao)).toEqual([1, 1]);
  });
});
