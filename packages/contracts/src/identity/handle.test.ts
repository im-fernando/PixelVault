import { describe, expect, it } from 'vitest';
import { HANDLES_RESERVADOS, handleSchema } from './handle.js';

describe('handleSchema', () => {
  it.each(['fernando', 'jogador-1', 'a1b'])('aceita %s', (valor) => {
    expect(handleSchema.safeParse(valor).success).toBe(true);
  });

  it.each(['Fernando', 'jogador_1', '-inicio', 'fim-', 'ab', 'com espaço'])(
    'recusa %o',
    (valor) => {
      expect(handleSchema.safeParse(valor).success).toBe(false);
    },
  );

  it.each(HANDLES_RESERVADOS)('recusa a palavra reservada "%s"', (reservado) => {
    expect(handleSchema.safeParse(reservado).success).toBe(false);
  });
});
