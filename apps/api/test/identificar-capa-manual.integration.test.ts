import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { buildApp } from '../src/app.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * `POST /api/games/:gameId/cover` contra PostgreSQL de verdade.
 *
 * `CAPA_TRANSPORTE` é `desligada` em teste (ver `criar-busca-de-capa.ts`),
 * então o provedor externo nunca é consultado de verdade aqui — o caminho
 * "achou" já tem suíte própria em `identificar-capa-manual.test.ts`, com o
 * provedor trocado à mão. O que esta suíte afirma é o que só existe com HTTP
 * e banco de verdade: exige sessão, e as três razões de "não há o que
 * procurar" (inexistente, já tem capa, homebrew) respondem 404 igual.
 */
const IP_DO_ARQUIVO = '198.51.100.134';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const conta = rastro.identidadeNova('id-capa');

let app: FastifyInstance;

async function logar(): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: conta.email, password: 'cavalo-bateria-grampo' },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(200);
  const cookie = resposta.cookies.find((c) => c.name === NOME_DO_COOKIE_DE_SESSAO)?.value;
  expect(cookie).toBeDefined();
  return cookie ?? '';
}

async function identificar(
  gameId: string,
  title: string,
  cookie?: string,
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  return app.inject({
    method: 'POST',
    url: `/api/games/${gameId}/cover`,
    payload: { title },
    remoteAddress: IP_DO_ARQUIVO,
    ...(cookie === undefined ? {} : { cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie } }),
  });
}

async function criarJogo(dados: {
  slug: string;
  title: string;
  isHomebrew?: boolean;
  coverUrl?: string;
}): Promise<string> {
  const jogo = await prisma.game.create({
    data: {
      slug: dados.slug,
      title: dados.title,
      systemId: 'snes',
      isHomebrew: dados.isHomebrew ?? false,
      coverUrl: dados.coverUrl ?? null,
    },
    select: { id: true },
  });
  return jogo.id;
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...conta, password: 'cavalo-bateria-grampo', termsAccepted: true },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(202);
  await criador.close();

  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });
}, 30_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await prisma.game.deleteMany({ where: { slug: { startsWith: 'zz-teste-identificar-capa-' } } });
  await rastro.limpar();
});

describe('POST /api/games/:gameId/cover', () => {
  it('recusa quem não tem sessão', async () => {
    const gameId = await criarJogo({
      slug: `zz-teste-identificar-capa-${randomUUID().slice(0, 8)}`,
      title: 'Jogo sem sessão',
    });

    const resposta = await identificar(gameId, 'Jogo sem sessão (USA)');

    expect(resposta.statusCode).toBe(401);
  });

  it('responde 200 "não encontrada" para jogo sem capa — o provedor está desligado em teste', async () => {
    const gameId = await criarJogo({
      slug: `zz-teste-identificar-capa-${randomUUID().slice(0, 8)}`,
      title: 'Jogo sem capa',
    });
    const cookie = await logar();

    const resposta = await identificar(gameId, 'Jogo sem capa (USA)', cookie);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'nao-encontrada' });
  });

  it('dá 404 para jogo que já tem capa — nada para procurar', async () => {
    const gameId = await criarJogo({
      slug: `zz-teste-identificar-capa-${randomUUID().slice(0, 8)}`,
      title: 'Jogo com capa',
      coverUrl: '/roms/ja-tenho-capa.png',
    });
    const cookie = await logar();

    const resposta = await identificar(gameId, 'Jogo com capa (USA)', cookie);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json<{ code: string }>().code).toBe('NOT_FOUND');
  });

  it('dá 404 para homebrew — ADR 0016, não procura arte comercial pra ele', async () => {
    const gameId = await criarJogo({
      slug: `zz-teste-identificar-capa-${randomUUID().slice(0, 8)}`,
      title: 'Homebrew de teste',
      isHomebrew: true,
    });
    const cookie = await logar();

    const resposta = await identificar(gameId, 'Homebrew de teste (USA)', cookie);

    expect(resposta.statusCode).toBe(404);
  });

  it('dá 404 para gameId que não existe', async () => {
    const cookie = await logar();

    const resposta = await identificar(
      '00000000-0000-4000-8000-000000000000',
      'Qualquer nome',
      cookie,
    );

    expect(resposta.statusCode).toBe(404);
  });

  it('recusa corpo sem título', async () => {
    const gameId = await criarJogo({
      slug: `zz-teste-identificar-capa-${randomUUID().slice(0, 8)}`,
      title: 'Jogo qualquer',
    });
    const cookie = await logar();

    const resposta = await app.inject({
      method: 'POST',
      url: `/api/games/${gameId}/cover`,
      payload: {},
      remoteAddress: IP_DO_ARQUIVO,
      cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie },
    });

    expect(resposta.statusCode).toBe(400);
  });
});
