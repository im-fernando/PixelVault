import { describe, expect, it } from 'vitest';
import {
  criarRepeticaoDoDirecional,
  destinoNoTeclado,
  LINHAS_DO_TECLADO,
} from './teclado-do-console.js';

const teclas = LINHAS_DO_TECLADO.flatMap((linha, y) =>
  linha.split('').map((letra, x) => ({
    letra,
    x: (x + (10 - linha.length) / 2) * 100,
    y: y * 100,
  })),
);
describe('geometria do teclado do console', () => {
  it.each([
    ['1', 'down', 'Q'],
    ['Q', 'down', 'A'],
    ['A', 'down', 'Z'],
    ['0', 'down', 'P'],
    ['P', 'down', 'L'],
    ['L', 'down', '_'],
    ['_', 'up', 'L'],
    ['L', 'up', 'O'],
    ['P', 'up', '0'],
    ['Q', 'right', 'W'],
    ['W', 'left', 'Q'],
    ['Q', 'left', 'Q'],
    ['1', 'up', '1'],
    ['_', 'right', '_'],
  ] as const)('%s + %s chega a %s', (origem, direcao, esperado) => {
    const destino = destinoNoTeclado(
      teclas,
      teclas.findIndex((t) => t.letra === origem),
      direcao,
    );
    expect(teclas[destino]?.letra).toBe(esperado);
  });
  it('acompanha ações que quebraram em duas linhas no celular', () => {
    const acoes = [
      { x: 50, y: 0 },
      { x: 150, y: 0 },
      { x: 50, y: 60 },
      { x: 150, y: 60 },
    ];
    expect(destinoNoTeclado(acoes, 0, 'down')).toBe(2);
    expect(destinoNoTeclado(acoes, 3, 'up')).toBe(1);
    expect(destinoNoTeclado(acoes, 3, 'down')).toBe(3);
  });
  it('preserva a coluna de origem ao atravessar uma linha mais curta', () => {
    const p = teclas.findIndex((t) => t.letra === 'P');
    const l = destinoNoTeclado(teclas, p, 'down');
    expect(teclas[l]?.letra).toBe('L');
    expect(destinoNoTeclado(teclas, l, 'up', teclas[p]!.x)).toBe(p);
  });
  it('repete só depois da pausa inicial e reinicia ao soltar ou mudar de direção', () => {
    const repetir = criarRepeticaoDoDirecional();
    expect(repetir('down', 0)).toBe('down');
    expect(repetir('down', 359)).toBeNull();
    expect(repetir('down', 360)).toBe('down');
    expect(repetir('down', 474)).toBeNull();
    expect(repetir('down', 475)).toBe('down');
    expect(repetir('up', 476)).toBe('up');
    expect(repetir(null, 477)).toBeNull();
    expect(repetir('up', 478)).toBe('up');
  });
});
