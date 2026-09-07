import { HANDLES_RESERVADOS } from '@pixelvault/contracts';
import { describe, expect, it } from 'vitest';
import type { ErroDeIdentidade } from './erros.js';
import { Handle } from './handle.js';

describe('Handle', () => {
  it('normaliza para minúsculas', () => {
    expect(Handle.criar('Fernando').toString()).toBe('fernando');
  });

  it('aceita kebab-case', () => {
    expect(Handle.criar('jogador-1').toString()).toBe('jogador-1');
  });

  it('recusa formato fora de kebab-case com HANDLE_INVALIDO', () => {
    expect.assertions(1);
    try {
      Handle.criar('jogador_1');
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('HANDLE_INVALIDO');
    }
  });

  it('recusa handle curto demais com HANDLE_INVALIDO', () => {
    expect.assertions(1);
    try {
      Handle.criar('ab');
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('HANDLE_INVALIDO');
    }
  });

  it.each(HANDLES_RESERVADOS)('recusa a palavra reservada "%s" com HANDLE_RESERVADO', (reservado) => {
    expect.assertions(1);
    try {
      Handle.criar(reservado);
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('HANDLE_RESERVADO');
    }
  });

  it('reserva é case-insensitive', () => {
    expect.assertions(1);
    try {
      Handle.criar('ADMIN');
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('HANDLE_RESERVADO');
    }
  });
});
