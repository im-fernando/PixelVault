import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../infrastructure/errors.js';
import type { Papel } from '../domain/habilidades.js';
import type {
  CredenciaisDoUsuario,
  DadosDeCadastro,
  DadosDoUsuario,
  PerfilPublico,
  ResultadoDeCadastro,
  UserRepository,
} from '../domain/user-repository.js';
import { trocarSenha, type DependenciasDaTrocaDeSenha } from './trocar-senha.js';

const USUARIO: CredenciaisDoUsuario = {
  id: 'usuario-1',
  email: 'pessoa@exemplo.test',
  handle: 'pessoa',
  displayName: 'Pessoa',
  publicProfile: true,
  senhaHash: 'hash-da-senha-atual',
};

interface Espiao {
  regravacoes: { id: string; senhaHash: string }[];
  conferencias: { senhaPlana: string; hash: string }[];
}

function montar(
  usuario: CredenciaisDoUsuario | null,
  senhaCorreta: string,
): { deps: DependenciasDaTrocaDeSenha; espiao: Espiao } {
  const espiao: Espiao = { regravacoes: [], conferencias: [] };

  const usuarios: UserRepository = {
    async handleEmUso(): Promise<boolean> {
      return false;
    },
    async cadastrar(_dados: DadosDeCadastro): Promise<ResultadoDeCadastro> {
      return 'criado';
    },
    async buscarCredenciaisPorEmail(): Promise<CredenciaisDoUsuario | null> {
      return usuario;
    },
    async buscarCredenciaisPorId(): Promise<CredenciaisDoUsuario | null> {
      return usuario;
    },
    async buscarPorId(): Promise<DadosDoUsuario | null> {
      return usuario;
    },
    async buscarPapelPorId(): Promise<Papel | null> {
      return usuario === null ? null : 'user';
    },
    async regravarSenhaHash(id: string, senhaHash: string): Promise<void> {
      espiao.regravacoes.push({ id, senhaHash });
    },
    async perfisPublicosPorIds(): Promise<PerfilPublico[]> {
      return [];
    },
    async perfilPublicoPorHandle(): Promise<PerfilPublico | null> {
      return null;
    },
    async definirPerfilPublico(): Promise<void> {},
  };

  return {
    espiao,
    deps: {
      usuarios,
      async verificar(senhaPlana: string, hash: string): Promise<boolean> {
        espiao.conferencias.push({ senhaPlana, hash });
        return senhaPlana === senhaCorreta;
      },
      async gerarHash(senhaPlana: string): Promise<string> {
        return `hash:${senhaPlana}`;
      },
    },
  };
}

describe('trocarSenha', () => {
  it('regrava o hash da senha nova depois de conferir a atual', async () => {
    const { deps, espiao } = montar(USUARIO, 'a-senha-de-agora');

    await trocarSenha(deps, 'usuario-1', {
      currentPassword: 'a-senha-de-agora',
      newPassword: 'a-proxima-senha-longa',
    });

    expect(espiao.conferencias).toEqual([
      { senhaPlana: 'a-senha-de-agora', hash: 'hash-da-senha-atual' },
    ]);
    expect(espiao.regravacoes).toEqual([
      { id: 'usuario-1', senhaHash: 'hash:a-proxima-senha-longa' },
    ]);
  });

  it('recusa com 422 quando a senha atual não confere, e não grava nada', async () => {
    const { deps, espiao } = montar(USUARIO, 'a-senha-de-agora');

    // 422 e não 401: 401 significa "sua sessão não vale", e o front deslogaria
    // quem apenas errou a digitação da senha antiga.
    await expect(
      trocarSenha(deps, 'usuario-1', {
        currentPassword: 'nao-e-a-senha',
        newPassword: 'a-proxima-senha-longa',
      }),
    ).rejects.toMatchObject({ status: 422, code: 'VALIDATION_FAILED' });
    expect(espiao.regravacoes).toHaveLength(0);
  });

  it('aplica a política de senha na nova, nunca na atual', async () => {
    // A senha atual tem 5 caracteres — não passaria na política de hoje. Quem
    // se cadastrou antes de o mínimo subir precisa continuar conseguindo
    // provar que a sabe para poder trocá-la.
    const { deps, espiao } = montar(USUARIO, 'curta');

    await trocarSenha(deps, 'usuario-1', {
      currentPassword: 'curta',
      newPassword: 'a-proxima-senha-longa',
    });
    expect(espiao.regravacoes).toHaveLength(1);

    await expect(
      trocarSenha(deps, 'usuario-1', { currentPassword: 'curta', newPassword: 'onze-caract' }),
    ).rejects.toMatchObject({ status: 422, details: { password: ['SENHA_MUITO_CURTA'] } });
    expect(espiao.regravacoes).toHaveLength(1);
  });

  it('trata sessão válida para usuário inexistente como 401, nunca como 500', async () => {
    const { deps } = montar(null, 'a-senha-de-agora');

    const erro = await trocarSenha(deps, 'usuario-fantasma', {
      currentPassword: 'a-senha-de-agora',
      newPassword: 'a-proxima-senha-longa',
    }).catch((capturado: unknown) => capturado);

    expect(erro).toBeInstanceOf(DomainError);
    expect(erro).toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
  });
});
