import { describe, expect, it } from 'vitest';
import { caminhoDaRom } from './caminho-da-rom.js';

const HASH = 'a'.repeat(64);

describe('caminhoDaRom', () => {
  it('endereça o objeto pelo conteúdo', () => {
    expect(caminhoDaRom(HASH)).toBe(`roms/${HASH}`);
  });

  it('recusa o que não é SHA-256, em vez de montar caminho com aquilo', () => {
    // O objeto em `roms/` é compartilhado por todo mundo que tem aquele
    // conteúdo (ADR 0013): escrever no caminho errado é escrever na ROM dos
    // outros. Hoje o argumento vem de um `createHash` e isto não pode falhar —
    // e é por ser barata que a checagem fica, para o dia em que vier de outro
    // lugar.
    expect(() => caminhoDaRom('../quarentena/alguem')).toThrow(TypeError);
    expect(() => caminhoDaRom('A'.repeat(64))).toThrow(TypeError);
    expect(() => caminhoDaRom(`${HASH}/mais`)).toThrow(TypeError);
    expect(() => caminhoDaRom('')).toThrow(TypeError);
  });
});
