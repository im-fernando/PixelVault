import { describe, expect, it } from 'vitest';
import type { ErroDeIdentidade } from './erros.js';
import { User } from './user.js';

function propsValidas(sobrescritas: Partial<Parameters<typeof User.criar>[0]> = {}) {
  return {
    id: '00000000-0000-4000-8000-000000000001',
    email: 'fulano@exemplo.com',
    handle: 'fulano',
    displayName: 'Fulano de Tal',
    senhaPlana: 'cavalo-marinho-azul',
    senhaHash: '$argon2id$hash-de-mentira',
    ...sobrescritas,
  };
}

describe('User.criar', () => {
  it('cria um usuário válido', () => {
    const user = User.criar(propsValidas());
    expect(user.getEmail().toString()).toBe('fulano@exemplo.com');
    expect(user.getHandle().toString()).toBe('fulano');
    expect(user.getDisplayName()).toBe('Fulano de Tal');
    expect(user.getSenhaHash()).toBe('$argon2id$hash-de-mentira');
  });

  it('é impossível criar um usuário com e-mail inválido', () => {
    expect.assertions(1);
    try {
      User.criar(propsValidas({ email: 'não-é-email' }));
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('EMAIL_INVALIDO');
    }
  });

  it('é impossível criar um usuário com handle reservado', () => {
    expect.assertions(1);
    try {
      User.criar(propsValidas({ handle: 'admin' }));
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('HANDLE_RESERVADO');
    }
  });

  it('é impossível criar um usuário com senha fraca', () => {
    expect.assertions(1);
    try {
      User.criar(propsValidas({ senhaPlana: 'curta' }));
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('SENHA_MUITO_CURTA');
    }
  });

  it('é impossível criar um usuário com nome de exibição vazio', () => {
    expect.assertions(1);
    try {
      User.criar(propsValidas({ displayName: '   ' }));
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('NOME_INVALIDO');
    }
  });
});

describe('User.trocarSenha', () => {
  it('troca o hash quando a nova senha passa na política', () => {
    const user = User.criar(propsValidas());
    user.trocarSenha('outra-senha-bem-comprida', '$argon2id$novo-hash');
    expect(user.getSenhaHash()).toBe('$argon2id$novo-hash');
  });

  it('recusa trocar para uma senha que não passa na política, e mantém o hash antigo', () => {
    const user = User.criar(propsValidas());
    expect.assertions(2);
    try {
      user.trocarSenha('123456', '$argon2id$novo-hash');
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('SENHA_COMUM');
    }
    expect(user.getSenhaHash()).toBe('$argon2id$hash-de-mentira');
  });
});

describe('User.renomear', () => {
  it('normaliza espaço nas bordas', () => {
    const user = User.criar(propsValidas());
    user.renomear('  Novo Nome  ');
    expect(user.getDisplayName()).toBe('Novo Nome');
  });

  it('recusa nome vazio', () => {
    const user = User.criar(propsValidas());
    expect(() => user.renomear('   ')).toThrow();
  });
});
