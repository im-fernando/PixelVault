import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { buildApp } from '../src/app.js';
import { LIMITES } from '../src/modules/identity/domain/limite-de-tentativas.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * Integração de verdade: PostgreSQL real, migrations aplicadas, app Fastify
 * inteiro por `inject()`. Nada aqui é mock — o que está sob teste é
 * justamente o que só o banco decide (a constraint de unicidade sob corrida)
 * e o que só a pilha inteira mostra (a resposta ser indistinguível).
 *
 * O rate limit do cadastro conta por IP, no PostgreSQL (docs/adr/0019), e o
 * contador não some quando o app é recriado. Por isso duas coisas: todo
 * request daqui sai de um IP só deste arquivo — para não disputar cota com
 * os outros arquivos de teste, que rodam em paralelo contra o mesmo banco —
 * e cada `it` começa com esse contador zerado.
 */
const IP_DO_ARQUIVO = '198.51.100.10';

/**
 * O e-mail do cenário de rate limit. Fixo, e por isso acumula no eixo do
 * identificador de uma execução para a outra — entra na limpeza junto com o
 * IP. Os demais cenários usam e-mail novo a cada vez e não têm o problema.
 */
const EMAIL_INVALIDO = 'não-é-email';

/** Identidades novas a cada execução e a limpeza delas. Ver test/suporte/rastro.ts. */
const rastro = rastroDeTeste(IP_DO_ARQUIVO, EMAIL_INVALIDO);

function corpoDeCadastro(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    password: 'cavalo-bateria-grampo',
    termsAccepted: true,
    ...sobrescritas,
  };
}

let app: FastifyInstance;

async function cadastrar(payload: Record<string, unknown>): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload,
    remoteAddress: IP_DO_ARQUIVO,
  });
}

type RespostaInjetada = Awaited<ReturnType<typeof cadastrar>>;

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await rastro.limpar();
});

describe('POST /api/auth/register', () => {
  it('cria o usuário no banco, com aceite dos termos carimbado pelo servidor', async () => {
    const { email, handle } = rastro.identidadeNova('feliz');
    const antesDoCadastro = new Date();

    const resposta = await cadastrar(corpoDeCadastro({ email: email.toUpperCase(), handle }));

    expect(resposta.statusCode).toBe(202);
    expect(resposta.json()).toEqual({ status: 'cadastro-recebido' });

    const gravado = await prisma.user.findUnique({ where: { email } });
    expect(gravado).not.toBeNull();
    // E-mail normalizado antes de gravar: quem se cadastrou com maiúsculas
    // precisa ser a mesma conta de quem digitar minúsculas depois.
    expect(gravado?.email).toBe(email);
    expect(gravado?.handle).toBe(handle);
    // displayName ausente no request: derivado do handle.
    expect(gravado?.displayName).toBe(
      handle
        .split('-')
        .map((bloco) => bloco.charAt(0).toUpperCase() + bloco.slice(1))
        .join(' '),
    );
    expect(gravado?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(gravado?.termsAcceptedAt.getTime()).toBeGreaterThanOrEqual(antesDoCadastro.getTime());
  }, 30_000);

  it('responde a e-mail já cadastrado exatamente como responde a cadastro novo', async () => {
    const { email, handle } = rastro.identidadeNova('duplicado');

    const primeira = await cadastrar(corpoDeCadastro({ email, handle }));

    // Handle diferente de propósito: é assim que alguém sonda um e-mail sem
    // esbarrar na recusa honesta de handle em uso.
    const segunda = await cadastrar(corpoDeCadastro({ email, handle: `${handle}-2` }));

    expect(segunda.statusCode).toBe(primeira.statusCode);
    expect(segunda.json()).toEqual(primeira.json());

    expect(await prisma.user.count({ where: { email } })).toBe(1);
    // A segunda tentativa não pode ter deixado rastro nenhum.
    expect(await prisma.user.count({ where: { handle: `${handle}-2` } })).toBe(0);
  }, 30_000);

  it('duas requisições simultâneas com o mesmo e-mail criam um usuário só', async () => {
    const { email, handle } = rastro.identidadeNova('corrida');

    const respostas = await Promise.all([
      cadastrar(corpoDeCadastro({ email, handle: `${handle}-a` })),
      cadastrar(corpoDeCadastro({ email, handle: `${handle}-b` })),
    ]);

    // Nenhuma das duas pode ter estourado: quem perdeu a corrida perdeu na
    // constraint do banco, e isso vira a mesma resposta de sucesso.
    for (const resposta of respostas) {
      expect(resposta.statusCode).toBe(202);
      expect(resposta.json()).toEqual({ status: 'cadastro-recebido' });
    }

    expect(await prisma.user.count({ where: { email } })).toBe(1);
  }, 30_000);

  it('recusa handle já em uso com mensagem honesta', async () => {
    const { email, handle } = rastro.identidadeNova('handle');
    const outro = rastro.identidadeNova('handle-outro');

    await cadastrar(corpoDeCadastro({ email, handle }));

    const resposta = await cadastrar(corpoDeCadastro({ email: outro.email, handle }));

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({
      code: 'CONFLICT',
      details: { handle: ['HANDLE_EM_USO'] },
    });
    expect(await prisma.user.count({ where: { email: outro.email } })).toBe(0);
  }, 30_000);

  it('recusa quem não aceitou os termos, sem tocar no banco', async () => {
    const { email, handle } = rastro.identidadeNova('termos');

    const resposta = await cadastrar(corpoDeCadastro({ email, handle, termsAccepted: false }));

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('corta o IP que insiste, com o formato de erro do resto da API', async () => {
    // Corpo inválido de propósito: o que interessa é a contagem por IP, e
    // assim o teste não paga seis hashes Argon2id nem suja o banco. Contar
    // antes da validação é escolha do mecanismo (ver `limite-de-autenticacao.ts`):
    // se corpo lixo não contasse, mandar corpo lixo seria requisição de graça.
    const invalido = {
      email: EMAIL_INVALIDO,
      handle: 'x',
      password: 'curta',
      termsAccepted: true,
    };

    for (let i = 0; i < LIMITES.register.ip.limite; i += 1) {
      expect((await cadastrar(invalido)).statusCode).toBe(400);
    }

    const excedente = await cadastrar(invalido);
    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rateLimit: ['LIMITE_POR_IP'] },
    });
    expect(excedente.headers['ratelimit-remaining']).toBe('0');
    expect(Number(excedente.headers['retry-after'])).toBeGreaterThan(0);
  });
});
