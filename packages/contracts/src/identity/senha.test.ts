import { describe, expect, it } from 'vitest';
import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA, senhaCandidataSchema } from './senha.js';

describe('senhaCandidataSchema', () => {
  it('aceita senha no tamanho mínimo', () => {
    expect(senhaCandidataSchema.safeParse('a'.repeat(TAMANHO_MINIMO_SENHA)).success).toBe(true);
  });

  it('recusa senha abaixo do tamanho mínimo', () => {
    expect(senhaCandidataSchema.safeParse('a'.repeat(TAMANHO_MINIMO_SENHA - 1)).success).toBe(
      false,
    );
  });

  it('recusa senha acima do tamanho máximo', () => {
    expect(senhaCandidataSchema.safeParse('a'.repeat(TAMANHO_MAXIMO_SENHA + 1)).success).toBe(
      false,
    );
  });
});
