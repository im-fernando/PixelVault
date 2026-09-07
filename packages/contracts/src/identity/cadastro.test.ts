import { describe, expect, it } from 'vitest';
import { registerRequestSchema } from './cadastro.js';

function corpoValido(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    email: 'fulano@exemplo.com',
    handle: 'fulano',
    password: 'cavalo-bateria-grampo',
    termsAccepted: true,
    ...sobrescritas,
  };
}

describe('registerRequestSchema', () => {
  it('aceita um cadastro sem displayName', () => {
    expect(registerRequestSchema.safeParse(corpoValido()).success).toBe(true);
  });

  it('recusa quem não aceitou os termos', () => {
    expect(registerRequestSchema.safeParse(corpoValido({ termsAccepted: false })).success).toBe(
      false,
    );
  });

  it('recusa a ausência do aceite', () => {
    const { termsAccepted: _ignorado, ...semAceite } = corpoValido();
    expect(registerRequestSchema.safeParse(semAceite).success).toBe(false);
  });

  it('recusa handle reservado, que colidiria com rota do sistema', () => {
    expect(registerRequestSchema.safeParse(corpoValido({ handle: 'admin' })).success).toBe(false);
  });

  it('recusa senha curta demais para a política', () => {
    expect(registerRequestSchema.safeParse(corpoValido({ password: 'curta' })).success).toBe(false);
  });
});
