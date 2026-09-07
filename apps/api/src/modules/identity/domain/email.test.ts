import { describe, expect, it } from 'vitest';
import { Email } from './email.js';

describe('Email', () => {
  it('normaliza para minúsculas', () => {
    expect(Email.criar('Fulano@Exemplo.com').toString()).toBe('fulano@exemplo.com');
  });

  it('remove espaço nas bordas', () => {
    expect(Email.criar('  fulano@exemplo.com  ').toString()).toBe('fulano@exemplo.com');
  });

  it('compara sem diferenciar maiúsculas de minúsculas', () => {
    const a = Email.criar('Fulano@Exemplo.com');
    const b = Email.criar('fulano@exemplo.com');
    expect(a.igualA(b)).toBe(true);
  });

  it('recusa e-mail malformado com EMAIL_INVALIDO', () => {
    expect.assertions(2);
    try {
      Email.criar('não-é-email');
    } catch (erro) {
      expect(erro).toBeInstanceOf(Error);
      expect((erro as { codigo: string }).codigo).toBe('EMAIL_INVALIDO');
    }
  });

  it('é impossível ter uma instância de Email com valor inválido', () => {
    expect(() => Email.criar('')).toThrow();
    expect(() => Email.criar('sem-arroba')).toThrow();
  });
});
