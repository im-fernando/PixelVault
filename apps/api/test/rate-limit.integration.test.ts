import { randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { LIMITES } from '../src/modules/identity/domain/limite-de-tentativas.js';
import { chaveDeTentativa } from '../src/modules/identity/infrastructure/chave-de-tentativa.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const config = loadConfig({ ...process.env, NODE_ENV: 'test' });

/**
 * Integração de verdade: PostgreSQL real, Argon2id real, app inteiro por
 * `inject()`. O contador que está sob teste vive no banco (docs/adr/0019),
 * então testá-lo com mock testaria o mock.
 *
 * Cada cenário declara o IP de onde fala. Não é enfeite: o critério de
 * aceite da #49 é exatamente distinguir "esta conta está bloqueada" de
 * "todo mundo está bloqueado", e sem controlar a origem não dá para separar
 * o eixo do IP do eixo do identificador. Os endereços vêm de faixas
 * reservadas para documentação (RFC 5737), inclusive para não colidir com o
 * `127.0.0.1` que os outros arquivos de teste usam quando rodam em paralelo.
 */
const IP_CADASTRO = '203.0.113.10';
const IP_A = '203.0.113.11';
const IP_B = '203.0.113.12';
const IP_C = '203.0.113.13';

const SENHA = 'cavalo-bateria-grampo';
const emailsCriados: string[] = [];

function identidadeNova(prefixo: string): { email: string; handle: string } {
  const sufixo = randomUUID().slice(0, 8);
  const email = `teste-${prefixo}-${sufixo}@exemplo.test`;
  emailsCriados.push(email);
  return { email, handle: `teste-${prefixo}-${sufixo}` };
}

const alvo = identidadeNova('alvo');
const vizinha = identidadeNova('vizinha');

/** As chaves que este arquivo suja e precisa limpar entre cenários. */
const chavesDoArquivo: string[] = [IP_CADASTRO, IP_A, IP_B, IP_C, alvo.email, vizinha.email];

let app: FastifyInstance;

async function logar(
  credenciais: { email: string; password: string },
  ip: string,
): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credenciais,
    remoteAddress: ip,
  });
}

type RespostaInjetada = Awaited<ReturnType<typeof logar>>;

/**
 * Zera o contador das chaves deste arquivo. Como a tabela guarda HMAC e não
 * o valor em claro, o teste calcula a mesma chave que a aplicação calcularia
 * — o que, de quebra, deixa explícito que não há e-mail nem IP legível ali.
 */
async function limparContador(valores: string[]): Promise<void> {
  await prisma.authAttempt.deleteMany({
    where: {
      keyHash: { in: valores.map((valor) => chaveDeTentativa(config.SESSION_SECRET, valor)) },
    },
  });
}

async function tentativasGravadas(valor: string): Promise<number> {
  return prisma.authAttempt.count({
    where: { keyHash: chaveDeTentativa(config.SESSION_SECRET, valor) },
  });
}

beforeAll(async () => {
  const criador = await buildApp(config);
  for (const conta of [alvo, vizinha]) {
    const resposta = await criador.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...conta, password: SENHA, termsAccepted: true },
      remoteAddress: IP_CADASTRO,
    });
    expect(resposta.statusCode).toBe(202);
  }
  await criador.close();

  // O identificador da troca de senha é o `userId`, não o e-mail: sem ele na
  // lista, o contador daquele cenário sobreviveria à limpeza.
  const contas = await prisma.user.findMany({
    where: { email: { in: [alvo.email, vizinha.email] } },
    select: { id: true },
  });
  chavesDoArquivo.push(...contas.map((conta) => conta.id));
}, 60_000);

beforeEach(async () => {
  app = await buildApp(config);
  await limparContador(chavesDoArquivo);
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await limparContador(chavesDoArquivo);
  await prisma.user.deleteMany({ where: { email: { in: emailsCriados } } });
  await prisma.$disconnect();
});

describe('rate limit do login por IP', () => {
  it('corta o IP que insiste, com cabeçalhos e o código estável do contrato', async () => {
    // E-mails diferentes a cada tentativa: é assim que se parece um ataque
    // de lista de credenciais, e é o que garante que o eixo medido aqui é o
    // do IP — nenhum identificador se repete para acumular sozinho.
    const { limite } = LIMITES.login.ip;
    for (let i = 0; i < limite; i += 1) {
      const resposta = await logar(
        { email: `nao-existe-${randomUUID()}@exemplo.test`, password: SENHA },
        IP_A,
      );
      expect(resposta.statusCode).toBe(401);
      expect(resposta.headers['ratelimit-limit']).toBe(String(limite));
    }

    const excedente = await logar(
      { email: `nao-existe-${randomUUID()}@exemplo.test`, password: SENHA },
      IP_A,
    );

    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rateLimit: ['LIMITE_POR_IP'] },
    });
    expect(excedente.headers['ratelimit-remaining']).toBe('0');
    expect(Number(excedente.headers['retry-after'])).toBeGreaterThan(0);

    // Outro IP não paga pelo primeiro: o bloqueio é da origem, não da rota.
    const vizinho = await logar({ email: alvo.email, password: SENHA }, IP_B);
    expect(vizinho.statusCode).toBe(200);
  }, 180_000);
});

describe('rate limit do login por identificador', () => {
  /**
   * O critério de aceite da issue #49.
   *
   * As tentativas contra a conta alvo são espalhadas por três IPs, cada um
   * abaixo do próprio teto — é o ataque distribuído, que um limite por IP
   * sozinho não enxerga. Depois de a conta alvo estar bloqueada, a conta
   * vizinha entra normalmente **pelo mesmo IP** de onde saíram as últimas
   * tentativas: se o contador fosse global, ou se estivesse preso ao IP, ela
   * também estaria de fora.
   */
  it('bloqueia a conta alvo sem tirar a conta vizinha do ar', async () => {
    const porIp = [
      [IP_A, 10],
      [IP_B, 10],
      [IP_C, LIMITES.login.identifier.limite - 20],
    ] as const;

    for (const [ip, quantas] of porIp) {
      for (let i = 0; i < quantas; i += 1) {
        const resposta = await logar({ email: alvo.email, password: 'senha-errada-1' }, ip);
        expect(resposta.statusCode).toBe(401);
      }
    }

    const excedente = await logar({ email: alvo.email, password: 'senha-errada-1' }, IP_C);
    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rateLimit: ['LIMITE_POR_IDENTIFICADOR'] },
    });

    // Nem a senha certa passa enquanto o bloqueio vale, e isso é
    // deliberado: liberar quem acerta significaria conferir a senha antes de
    // aplicar o limite, e aí o limite não limitaria adivinhação nenhuma. O
    // preço é a espera, que tem teto de 15 minutos e não derruba as sessões
    // que a pessoa já tem abertas.
    const dona = await logar({ email: alvo.email, password: SENHA }, IP_C);
    expect(dona.statusCode).toBe(429);

    // E o que a issue pede para provar: outra conta, pelo mesmo IP, entra.
    const outra = await logar({ email: vizinha.email, password: SENHA }, IP_C);
    expect(outra.statusCode).toBe(200);
    expect(outra.cookies.some((cookie) => cookie.name === NOME_DO_COOKIE_DE_SESSAO)).toBe(true);
  }, 180_000);

  it('apaga o rastro do identificador quando a senha acerta', async () => {
    for (let i = 0; i < 3; i += 1) {
      expect(
        (await logar({ email: vizinha.email, password: 'senha-errada-2' }, IP_A)).statusCode,
      ).toBe(401);
    }
    expect(await tentativasGravadas(vizinha.email)).toBe(3);

    expect((await logar({ email: vizinha.email, password: SENHA }, IP_A)).statusCode).toBe(200);

    // Quem provou saber a senha não continua andando na direção do bloqueio.
    expect(await tentativasGravadas(vizinha.email)).toBe(0);
    // O eixo do IP guarda os três erros — e não a tentativa que deu certo,
    // senão um escritório inteiro atrás do mesmo NAT esbarraria no limite só
    // por logar.
    expect(await tentativasGravadas(IP_A)).toBe(3);
  }, 120_000);
});

describe('o contador não guarda o que não deve', () => {
  it('grava só HMAC — nem e-mail, nem IP, nem nada derivado da senha', async () => {
    // Tentativa que falha, de propósito: a que dá certo é apagada em
    // seguida e não sobraria linha para inspecionar.
    await logar({ email: alvo.email, password: 'senha-errada-3' }, IP_A);

    const linhas = await prisma.authAttempt.findMany({
      where: {
        keyHash: {
          in: [IP_A, alvo.email].map((valor) => chaveDeTentativa(config.SESSION_SECRET, valor)),
        },
      },
    });

    expect(linhas.length).toBeGreaterThan(0);
    for (const linha of linhas) {
      expect(linha.keyHash).toMatch(/^[0-9a-f]{64}$/);
      expect(linha.keyHash).not.toContain(alvo.email);
      expect(linha.keyHash).not.toContain(IP_A);
      expect(linha.keyHash).not.toContain(SENHA);
    }
    // A tabela tem cinco colunas e nenhuma delas guarda texto livre além da
    // chave mascarada. Se alguém acrescentar uma, este teste cai.
    expect(Object.keys(linhas[0] ?? {}).sort()).toEqual([
      'createdAt',
      'id',
      'keyHash',
      'keyType',
      'scope',
    ]);
  }, 60_000);
});

describe('rate limit da troca de senha', () => {
  it('corta quem erra a senha atual muitas vezes, sem depender do IP', async () => {
    const entrada = await logar({ email: vizinha.email, password: SENHA }, IP_B);
    const cookie = entrada.cookies.find((c) => c.name === NOME_DO_COOKIE_DE_SESSAO)?.value ?? '';

    async function trocar(): Promise<RespostaInjetada> {
      return app.inject({
        method: 'POST',
        url: '/api/auth/change-password',
        payload: { currentPassword: 'nao-e-a-senha-atual', newPassword: 'outra-senha-comprida-9' },
        cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie },
        remoteAddress: IP_B,
      });
    }

    for (let i = 0; i < LIMITES.change_password.identifier.limite; i += 1) {
      expect((await trocar()).statusCode).toBe(422);
    }

    const excedente = await trocar();
    expect(excedente.statusCode).toBe(429);
    // O identificador aqui é o `userId` de quem já provou ser dono da conta,
    // e não um e-mail que qualquer um pode digitar — por isso o teto é
    // apertado sem virar arma contra ninguém.
    expect(excedente.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rateLimit: ['LIMITE_POR_IDENTIFICADOR'] },
    });
  }, 120_000);
});
