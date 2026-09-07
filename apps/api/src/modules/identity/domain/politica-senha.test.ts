import { TAMANHO_MAXIMO_SENHA, TAMANHO_MINIMO_SENHA } from '@pixelvault/contracts';
import { describe, expect, it } from 'vitest';
import type { ErroDeIdentidade } from './erros.js';
import { validarPoliticaDeSenha } from './politica-senha.js';

function codigoDoErro(fn: () => void): string {
  try {
    fn();
  } catch (erro) {
    return (erro as ErroDeIdentidade).codigo;
  }
  throw new Error('esperava que a política rejeitasse a senha');
}

describe('validarPoliticaDeSenha', () => {
  it('aceita senha longa o bastante e não comum', () => {
    expect(() => validarPoliticaDeSenha('cavalo-marinho-azul')).not.toThrow();
  });

  it('aceita senha exatamente no tamanho mínimo', () => {
    expect(() => validarPoliticaDeSenha('x7k2p9m3q1zz'.slice(0, TAMANHO_MINIMO_SENHA))).not.toThrow();
  });

  it('recusa senha curta demais com SENHA_MUITO_CURTA', () => {
    expect(codigoDoErro(() => validarPoliticaDeSenha('curta12'))).toBe('SENHA_MUITO_CURTA');
  });

  it('recusa senha longa demais com SENHA_MUITO_LONGA', () => {
    expect(codigoDoErro(() => validarPoliticaDeSenha('a'.repeat(TAMANHO_MAXIMO_SENHA + 1)))).toBe(
      'SENHA_MUITO_LONGA',
    );
  });

  it.each(['123456', 'password', 'senha1234567', 'password1234'])(
    'recusa a senha vazada "%s" com SENHA_COMUM, mesmo se o tamanho bater',
    (comum) => {
      expect(codigoDoErro(() => validarPoliticaDeSenha(comum))).toBe('SENHA_COMUM');
    },
  );

  it('checagem de senha comum é case-insensitive', () => {
    expect(codigoDoErro(() => validarPoliticaDeSenha('PASSWORD1234'))).toBe('SENHA_COMUM');
  });

  it('não exige símbolo nem maiúscula — a política é só de tamanho', () => {
    expect(() => validarPoliticaDeSenha('somente letras minusculas')).not.toThrow();
  });
});
