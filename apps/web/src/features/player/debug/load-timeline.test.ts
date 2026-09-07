import { describe, expect, it } from 'vitest';
import type { MarcoDeStatus } from '../use-emulator.js';
import { CARGA_VAZIA, linhaDoTempoDaCarga } from './load-timeline.js';

const marcos = (...pares: readonly (readonly [MarcoDeStatus['status'], number])[]) =>
  pares.map(([status, instanteMs]) => ({ status, instanteMs }));

describe('linhaDoTempoDaCarga', () => {
  it('reparte a carga entre core, ROM e primeiro quadro', () => {
    const linha = linhaDoTempoDaCarga(
      marcos(
        ['idle', 0],
        ['loading', 5],
        ['mounted', 800],
        ['loading', 801],
        ['ready', 2000],
        ['running', 2001],
      ),
      2033,
    );

    expect(linha).toEqual({
      coreMs: 800,
      romMs: 1200,
      primeiroQuadroMs: 33,
      totalMs: 2033,
    });
  });

  it('devolve nulo enquanto o marco não aconteceu, em vez de zero', () => {
    const linha = linhaDoTempoDaCarga(marcos(['idle', 0], ['loading', 5], ['mounted', 500]), null);

    expect(linha).toEqual({
      coreMs: 500,
      romMs: null,
      primeiroQuadroMs: null,
      totalMs: null,
    });
  });

  it('carga que passa direto para ready não deixa o tempo de core em aberto', () => {
    const linha = linhaDoTempoDaCarga(marcos(['idle', 0], ['ready', 700]), 710);

    expect(linha.coreMs).toBe(700);
    expect(linha.romMs).toBe(0);
    expect(linha.totalMs).toBe(710);
  });

  it('relançar a máquina no meio da partida não reescreve o tempo de carga', () => {
    // É o que `importSram` faz: derruba e remonta, passando por `loading` e
    // `ready` de novo. Isso não é uma carga nova.
    const linha = linhaDoTempoDaCarga(
      marcos(
        ['idle', 0],
        ['mounted', 100],
        ['ready', 200],
        ['running', 201],
        ['loading', 60_000],
        ['ready', 61_000],
        ['running', 61_001],
      ),
      210,
    );

    expect(linha.totalMs).toBe(210);
    expect(linha.romMs).toBe(100);
  });

  it('primeiro quadro sem ROM carregada é descartado', () => {
    const linha = linhaDoTempoDaCarga(marcos(['idle', 0], ['loading', 5]), 8);
    expect(linha.primeiroQuadroMs).toBeNull();
    expect(linha.totalMs).toBeNull();
  });

  it('sem marco nenhum devolve a linha vazia, e não NaN', () => {
    expect(linhaDoTempoDaCarga([], 100)).toEqual(CARGA_VAZIA);
  });
});
