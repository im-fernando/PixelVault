import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { LeaderboardResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * O ranking de playtime por jogo da issue #122, contra PostgreSQL de
 * verdade. O critério de aceite, literal: duas contas com playtime
 * diferente aparecem na ordem certa; a posição da própria conta é visível
 * mesmo fora do top N mostrado.
 *
 * O playtime das três contas é inserido direto em `user_games` — o que está
 * sob teste aqui é a LEITURA ordenada que `leaderboards` faz desse número,
 * não o caminho de crédito (heartbeat), que já tem suíte própria em
 * `heartbeat-de-playtime.integration.test.ts`. Mesma disciplina de
 * `conquistas.integration.test.ts` para as conquistas por agregação.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.122';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const primeiroColocado = rastro.identidadeNova('ranking-1o');
const segundoColocado = rastro.identidadeNova('ranking-2o');
const foraDoTop = rastro.identidadeNova('ranking-fora');

let idPrimeiroColocado: string;
let idSegundoColocado: string;
let idForaDoTop: string;

let jogoId: string;
let app: FastifyInstance;

function comCookie(cookie?: string): { remoteAddress: string; cookies?: Record<string, string> } {
  return {
    remoteAddress: IP_DO_ARQUIVO,
    ...(cookie === undefined ? {} : { cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie } }),
  };
}

async function logar(identidade: { email: string }): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: identidade.email, password: SENHA },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(200);

  const cookie = resposta.cookies.find((c) => c.name === NOME_DO_COOKIE_DE_SESSAO)?.value;
  expect(cookie).toBeDefined();
  return cookie ?? '';
}

async function criarConta(criador: FastifyInstance, dados: Record<string, unknown>): Promise<void> {
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...dados, password: SENHA, termsAccepted: true },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(202);
}

async function obterRanking(
  cookie: string | undefined,
  gameId: string,
  limit?: number,
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  return app.inject({
    method: 'GET',
    url: `/api/leaderboards/games/${gameId}${limit === undefined ? '' : `?limit=${limit}`}`,
    ...comCookie(cookie),
  });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, primeiroColocado);
  await criarConta(criador, segundoColocado);
  await criarConta(criador, foraDoTop);
  await criador.close();

  idPrimeiroColocado = (
    await prisma.user.findUniqueOrThrow({ where: { email: primeiroColocado.email } })
  ).id;
  idSegundoColocado = (
    await prisma.user.findUniqueOrThrow({ where: { email: segundoColocado.email } })
  ).id;
  idForaDoTop = (await prisma.user.findUniqueOrThrow({ where: { email: foraDoTop.email } })).id;

  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });

  jogoId = (
    await prisma.game.create({
      data: {
        slug: `zz-teste-ranking-${randomUUID().slice(0, 8)}`,
        title: 'Jogo de teste do ranking',
        systemId: 'snes',
      },
      select: { id: true },
    })
  ).id;

  // Playtime direto no banco — três contas, três totais bem distintos, um
  // deles fora do que `limit: 2` vai mostrar.
  await prisma.userGame.createMany({
    data: [
      { userId: idPrimeiroColocado, gameId: jogoId, totalPlaytimeSeconds: 300 },
      { userId: idSegundoColocado, gameId: jogoId, totalPlaytimeSeconds: 200 },
      { userId: idForaDoTop, gameId: jogoId, totalPlaytimeSeconds: 10 },
    ],
  });
}, 60_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await prisma.game.deleteMany({ where: { id: jogoId } });
  await rastro.limpar();
});

describe('GET /api/leaderboards/games/:gameId', () => {
  it('duas contas com playtime diferente aparecem na ordem certa', async () => {
    const cookie = await logar(primeiroColocado);

    const resposta = await obterRanking(cookie, jogoId, 2);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<LeaderboardResponse>();
    expect(corpo.top.map((linha) => ({ userId: linha.userId, rank: linha.rank }))).toEqual([
      { userId: idPrimeiroColocado, rank: 1 },
      { userId: idSegundoColocado, rank: 2 },
    ]);
    expect(corpo.top[0]?.totalPlaytimeSeconds).toBe(300);
    expect(corpo.top[1]?.totalPlaytimeSeconds).toBe(200);
  });

  it('a posição da própria conta é visível mesmo fora do top N mostrado', async () => {
    const cookie = await logar(foraDoTop);

    const resposta = await obterRanking(cookie, jogoId, 2);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<LeaderboardResponse>();

    // O top continua sendo o mesmo, mesmo pedido por quem está fora dele.
    expect(corpo.top.map((linha) => linha.userId)).toEqual([idPrimeiroColocado, idSegundoColocado]);
    expect(corpo.top.some((linha) => linha.userId === idForaDoTop)).toBe(false);

    expect(corpo.me).toEqual({
      userId: idForaDoTop,
      handle: foraDoTop.handle,
      displayName: expect.any(String),
      totalPlaytimeSeconds: 10,
      rank: 3,
    });
  });

  it('devolve me nulo para quem nunca creditou playtime nesse jogo', async () => {
    const semPlaytime = rastro.identidadeNova('rank-sem-tempo');
    await criarConta(app, semPlaytime);
    const cookie = await logar(semPlaytime);

    const resposta = await obterRanking(cookie, jogoId, 2);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<LeaderboardResponse>().me).toBeNull();
  });

  it('recusa quem não tem sessão', async () => {
    const resposta = await obterRanking(undefined, jogoId, 2);
    expect(resposta.statusCode).toBe(401);
  });
});
