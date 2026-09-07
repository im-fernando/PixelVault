import { describe, expect, it } from 'vitest';
import { emailSchema } from './email.js';

describe('emailSchema', () => {
  it.each(['pessoa@exemplo.com', 'nome.sobrenome+tag@dominio.com.br'])('aceita %s', (valor) => {
    expect(emailSchema.safeParse(valor).success).toBe(true);
  });

  it.each(['', 'sem-arroba', '@sem-usuario.com', 'espaco em@exemplo.com'])(
    'recusa %o',
    (valor) => {
      expect(emailSchema.safeParse(valor).success).toBe(false);
    },
  );

  it('recusa e-mail acima de 254 caracteres', () => {
    const local = 'a'.repeat(250);
    expect(emailSchema.safeParse(`${local}@x.com`).success).toBe(false);
  });
});
