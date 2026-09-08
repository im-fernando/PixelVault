import { describe, expect, it } from 'vitest';
import { DomainError } from '../../../infrastructure/errors.js';
import type {
  CredenciaisDoUsuario,
  DadosDeCadastro,
  DadosDoUsuario,
  ResultadoDeCadastro,
  UserRepository,
} from '../domain/user-repository.js';
import { autenticarUsuario, type ResultadoDaVerificacao } from './autenticar-usuario.js';

const HASH_DESCARTAVEL = '$argon2id$descartavel';

const FULANO: CredenciaisDoUsuario = {
  id: 'usuario-1',
  email: 'fulano@exemplo.test',
  handle: 'fulano',
  displayName: 'Fulano',
  senhaHash: '$argon2id$do-fulano',
};

interface Espiao {
  usuarios: UserRepository;
  /** Todo hash contra o qual a verificação foi chamada, na ordem. */
  hashesConferidos: string[];
  emailsBuscados: string[];
  regravacoes: { id: string; senhaHash: string }[];
}

function montar(
  usuario: CredenciaisDoUsuario | null,
  resultado: ResultadoDaVerificacao,
): {
  deps: Parameters<typeof autenticarUsuario>[0];
  espiao: Espiao;
} {
  const espiao: Espiao = {
    hashesConferidos: [],
    emailsBuscados: [],
    regravacoes: [],
    usuarios: {
      async handleEmUso(): Promise<boolean> {
        return false;
      },
      async cadastrar(_dados: DadosDeCadastro): Promise<ResultadoDeCadastro> {
        return 'criado';
      },
      async buscarCredenciaisPorEmail(email: string): Promise<CredenciaisDoUsuario | null> {
        espiao.emailsBuscados.push(email);
        return usuario;
      },
      async buscarCredenciaisPorId(): Promise<CredenciaisDoUsuario | null> {
        return usuario;
      },
      async buscarPorId(): Promise<DadosDoUsuario | null> {
        return usuario;
      },
      async regravarSenhaHash(id: string, senhaHash: string): Promise<void> {
        espiao.regravacoes.push({ id, senhaHash });
      },
    },
  };

  return {
    espiao,
    deps: {
      usuarios: espiao.usuarios,
      hashDescartavel: HASH_DESCARTAVEL,
      verificar: async (_senha, hash) => {
        espiao.hashesConferidos.push(hash);
        return resultado;
      },
    },
  };
}

async function erroDe(promessa: Promise<unknown>): Promise<DomainError> {
  try {
    await promessa;
  } catch (erro) {
    if (erro instanceof DomainError) return erro;
    throw erro;
  }
  throw new Error('esperava um erro e não veio nenhum');
}

describe('autenticarUsuario', () => {
  it('devolve o usuário quando a senha bate', async () => {
    const { deps } = montar(FULANO, { valida: true });

    expect(await autenticarUsuario(deps, { email: 'fulano@exemplo.test', password: 'ok' })).toEqual(
      {
        id: 'usuario-1',
        email: 'fulano@exemplo.test',
        handle: 'fulano',
        displayName: 'Fulano',
      },
    );
  });

  it('nunca devolve o hash da senha junto com o usuário', async () => {
    const { deps } = montar(FULANO, { valida: true });

    const usuario = await autenticarUsuario(deps, {
      email: 'fulano@exemplo.test',
      password: 'ok',
    });

    expect(Object.keys(usuario)).toEqual(['id', 'email', 'handle', 'displayName']);
  });

  it('roda a verificação contra o hash descartável quando o e-mail não tem conta', async () => {
    // Esta é a asserção central da anti-enumeração por tempo: o caminho do
    // e-mail inexistente NÃO pode sair sem pagar um Argon2. Se alguém
    // "otimizar" o caso de uso com um retorno antecipado, este teste quebra.
    const { deps, espiao } = montar(null, { valida: false });

    await erroDe(
      autenticarUsuario(deps, { email: 'ninguem@exemplo.test', password: 'seja-o-que-for' }),
    );

    expect(espiao.hashesConferidos).toEqual([HASH_DESCARTAVEL]);
  });

  it('paga o mesmo pedágio até para e-mail malformado', async () => {
    const { deps, espiao } = montar(null, { valida: false });

    await erroDe(autenticarUsuario(deps, { email: 'não-é-e-mail', password: 'seja-o-que-for' }));

    expect(espiao.emailsBuscados).toHaveLength(1);
    expect(espiao.hashesConferidos).toEqual([HASH_DESCARTAVEL]);
  });

  it('responde exatamente igual para e-mail inexistente e para senha errada', async () => {
    const inexistente = montar(null, { valida: false });
    const senhaErrada = montar(FULANO, { valida: false });

    const erroA = await erroDe(
      autenticarUsuario(inexistente.deps, { email: 'ninguem@exemplo.test', password: 'x' }),
    );
    const erroB = await erroDe(
      autenticarUsuario(senhaErrada.deps, { email: 'fulano@exemplo.test', password: 'x' }),
    );

    expect(erroA.status).toBe(401);
    expect(erroA.code).toBe('UNAUTHENTICATED');
    expect(erroB.status).toBe(erroA.status);
    expect(erroB.code).toBe(erroA.code);
    expect(erroB.message).toBe(erroA.message);
    expect(erroB.details).toEqual(erroA.details);
    expect(erroA.details).toEqual({ credentials: ['CREDENCIAIS_INVALIDAS'] });
    // E o hash conferido no caminho da senha errada é o do usuário, não o
    // descartável — os dois caminhos são diferentes por dentro e idênticos
    // por fora, que é exatamente o objetivo.
    expect(senhaErrada.espiao.hashesConferidos).toEqual([FULANO.senhaHash]);
  });

  it('busca pelo e-mail normalizado, para quem digitou maiúsculas entrar', async () => {
    const { deps, espiao } = montar(FULANO, { valida: true });

    await autenticarUsuario(deps, { email: '  FULANO@Exemplo.TEST ', password: 'ok' });

    expect(espiao.emailsBuscados).toEqual(['fulano@exemplo.test']);
  });

  it('regrava o hash migrado quando o Argon2id pede reidratação', async () => {
    const { deps, espiao } = montar(FULANO, { valida: true, novoHash: '$argon2id$novo' });

    await autenticarUsuario(deps, { email: 'fulano@exemplo.test', password: 'ok' });

    expect(espiao.regravacoes).toEqual([{ id: 'usuario-1', senhaHash: '$argon2id$novo' }]);
  });

  it('não regrava hash nenhum quando a senha está errada', async () => {
    const { deps, espiao } = montar(FULANO, { valida: false, novoHash: '$argon2id$novo' });

    await erroDe(autenticarUsuario(deps, { email: 'fulano@exemplo.test', password: 'x' }));

    expect(espiao.regravacoes).toHaveLength(0);
  });
});
