import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

// O .env é único e mora na raiz do monorepo. `dotenv` não sobrescreve o que
// já está no ambiente, então no CI (que exporta DATABASE_URL apontando para o
// serviço postgres do job) esta linha não muda nada.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const config = loadConfig({ ...process.env, NODE_ENV: 'test' });

/**
 * Integração de verdade: PostgreSQL real, migrations aplicadas, app Fastify
 * inteiro por `inject()`. Nada aqui é mock — o que está sob teste é
 * justamente o que só o banco decide (a constraint de unicidade sob corrida)
 * e o que só a pilha inteira mostra (a resposta ser indistinguível).
 *
 * Cada `it` monta seu próprio app: o rate limit da rota guarda o contador em
 * memória, por instância, e um app novo por cenário evita que um teste
 * consuma a cota do seguinte.
 */
const emailsCriados: string[] = [];

/** Sufixo único por execução, para dois runs em paralelo não colidirem. */
function identidadeNova(prefixo: string): { email: string; handle: string } {
  const sufixo = randomUUID().slice(0, 8);
  const email = `teste-${prefixo}-${sufixo}@exemplo.test`;
  emailsCriados.push(email);
  return { email, handle: `teste-${prefixo}-${sufixo}` };
}

function corpoDeCadastro(sobrescritas: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    password: 'cavalo-bateria-grampo',
    termsAccepted: true,
    ...sobrescritas,
  };
}

let app: FastifyInstance;

beforeEach(async () => {
  app = await buildApp(config);
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emailsCriados } } });
  await prisma.$disconnect();
});

describe('POST /api/auth/register', () => {
  it('cria o usuário no banco, com aceite dos termos carimbado pelo servidor', async () => {
    const { email, handle } = identidadeNova('feliz');
    const antesDoCadastro = new Date();

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email: email.toUpperCase(), handle }),
    });

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
    const { email, handle } = identidadeNova('duplicado');

    const primeira = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email, handle }),
    });

    // Handle diferente de propósito: é assim que alguém sonda um e-mail sem
    // esbarrar na recusa honesta de handle em uso.
    const segunda = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email, handle: `${handle}-2` }),
    });

    expect(segunda.statusCode).toBe(primeira.statusCode);
    expect(segunda.json()).toEqual(primeira.json());

    expect(await prisma.user.count({ where: { email } })).toBe(1);
    // A segunda tentativa não pode ter deixado rastro nenhum.
    expect(await prisma.user.count({ where: { handle: `${handle}-2` } })).toBe(0);
  }, 30_000);

  it('duas requisições simultâneas com o mesmo e-mail criam um usuário só', async () => {
    const { email, handle } = identidadeNova('corrida');

    const respostas = await Promise.all([
      app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: corpoDeCadastro({ email, handle: `${handle}-a` }),
      }),
      app.inject({
        method: 'POST',
        url: '/api/auth/register',
        payload: corpoDeCadastro({ email, handle: `${handle}-b` }),
      }),
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
    const { email, handle } = identidadeNova('handle');
    const outro = identidadeNova('handle-outro');

    await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email, handle }),
    });

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email: outro.email, handle }),
    });

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({
      code: 'CONFLICT',
      details: { handle: ['HANDLE_EM_USO'] },
    });
    expect(await prisma.user.count({ where: { email: outro.email } })).toBe(0);
  }, 30_000);

  it('recusa quem não aceitou os termos, sem tocar no banco', async () => {
    const { email, handle } = identidadeNova('termos');

    const resposta = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: corpoDeCadastro({ email, handle, termsAccepted: false }),
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });

  it('corta o IP que insiste, com o formato de erro do resto da API', async () => {
    // Corpo inválido de propósito: o que interessa é a contagem por IP, e
    // assim o teste não paga seis hashes Argon2id nem suja o banco.
    const invalido = { email: 'não-é-email', handle: 'x', password: 'curta', termsAccepted: true };
    const tentativa = async (): Promise<number> =>
      (await app.inject({ method: 'POST', url: '/api/auth/register', payload: invalido }))
        .statusCode;

    for (let i = 0; i < 5; i += 1) {
      expect(await tentativa()).toBe(400);
    }

    const excedente = await app.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: invalido,
    });
    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({ code: 'RATE_LIMITED' });
  });
});
