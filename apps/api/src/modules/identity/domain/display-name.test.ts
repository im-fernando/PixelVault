import { describe, expect, it } from 'vitest';
import { derivarDisplayNameDoHandle } from './display-name.js';

describe('derivarDisplayNameDoHandle', () => {
  it('transforma cada bloco do kebab-case em palavra capitalizada', () => {
    expect(derivarDisplayNameDoHandle('joao-silva')).toBe('Joao Silva');
  });

  it('funciona com handle de um bloco só', () => {
    expect(derivarDisplayNameDoHandle('fulano')).toBe('Fulano');
  });

  it('não engasga com dígito no começo do bloco', () => {
    expect(derivarDisplayNameDoHandle('retro-99')).toBe('Retro 99');
  });
});
