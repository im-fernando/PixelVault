import { describe, expect, it } from 'vitest';
import { sha256Schema, slugSchema, systemIdSchema } from './primitives.js';

describe('sha256Schema', () => {
  it('aceita hash hexadecimal minúsculo de 64 caracteres', () => {
    expect(sha256Schema.safeParse('a'.repeat(64)).success).toBe(true);
  });

  it('recusa hash em maiúsculas — a forma canônica é minúscula', () => {
    expect(sha256Schema.safeParse('A'.repeat(64)).success).toBe(false);
  });

  it('recusa hash de tamanho errado', () => {
    expect(sha256Schema.safeParse('abc').success).toBe(false);
  });
});

describe('slugSchema', () => {
  it.each(['zelda', 'super-mario-world', 'f-zero-2'])('aceita %s', (valor) => {
    expect(slugSchema.safeParse(valor).success).toBe(true);
  });

  it.each(['Zelda', 'super_mario', '-inicio', 'fim-', 'com espaço'])('recusa %s', (valor) => {
    expect(slugSchema.safeParse(valor).success).toBe(false);
  });
});

describe('systemIdSchema', () => {
  it('cobre os cinco consoles previstos', () => {
    expect(systemIdSchema.options).toEqual(['snes', 'nes', 'gb', 'gba', 'genesis']);
  });
});
