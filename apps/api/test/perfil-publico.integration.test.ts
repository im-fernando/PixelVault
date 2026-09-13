import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { PublicProfileResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * O perfil público da issue #123, contra PostgreSQL de verdade. O critério
 * de aceite, literal: visitar `/u/<handle>` sem sessão mostra o perfil;
 * handle inexistente dá 404 claro.
 *
 * As conquistas e o playtime desta conta entram direto no banco — o que
 * está sob teste é a AGREGAÇÃO que a rota faz (identity + achievements +
 * progress), não os caminhos de escrita, que já têm suíte própria em
 * `conquistas.integration.test.ts` e `heartbeat-de-playtime.integration.test.ts`.
 */
const IP_DO_ARQUIVO = '198.51.100.123';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dona = rastro.identidadeNova('perfil-publico');
let donaId: string;
let jogoId: string;

let app: FastifyInstance;

async function criarConta(criador: FastifyInstance, dados: Record<string, unknown>): Promise<void> {
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...dados, password: 'cavalo-bateria-grampo', termsAccepted: true },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(202);
}

async function buscarPerfil(
  handle: string,
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  // Sem cookie nenhum, de propósito: é o critério de aceite da #123 — ver o
  // perfil de outra pessoa não pede sessão.
  return app.inject({ method: 'GET', url: `/api/profiles/${handle}` });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, dona);
  await criador.close();

  donaId = (await prisma.user.findUniqueOrThrow({ where: { email: dona.email } })).id;

  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });

  jogoId = (
    await prisma.game.create({
      data: {
        slug: `zz-teste-perfil-publico-${randomUUID().slice(0, 8)}`,
        title: 'Jogo de teste do perfil público',
        systemId: 'snes',
      },
      select: { id: true },
    })
  ).id;

  // Uma conquista de evento e playtime agregado direto no banco — o mesmo
  // desenho de `conquistas.integration.test.ts` e
  // `ranking-de-playtime.integration.test.ts` para não repetir o caminho de
  // escrita, que já tem suíte própria.
  await prisma.userAchievement.create({
    data: { userId: donaId, code: 'primeira_rom_enviada' },
  });
  await prisma.userGame.create({
    data: { userId: donaId, gameId: jogoId, totalPlaytimeSeconds: 3600 },
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
  // `jogoId` só existe se o `beforeAll` terminou de atribuí-lo — se ele
  // lançar no meio (rede, corrida contra outro arquivo no mesmo banco
  // compartilhado, ADR 0022), `jogoId` fica `undefined` e
  // `deleteMany({ where: { id: undefined } })` não filtra por id nenhum: o
  // Prisma trata a ausência de valor como ausência de condição e apaga a
  // tabela `games` inteira. Já aconteceu — ver a issue que corrigiu isto.
  if (jogoId !== undefined) await prisma.game.deleteMany({ where: { id: jogoId } });
  await rastro.limpar();
});

describe('GET /api/profiles/:handle', () => {
  it('mostra o perfil de uma conta existente, sem exigir sessão', async () => {
    const resposta = await buscarPerfil(dona.handle);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<PublicProfileResponse>();

    expect(corpo).toEqual({
      handle: dona.handle,
      displayName: expect.any(String),
      achievements: [{ code: 'primeira_rom_enviada', unlockedAt: expect.any(String) as string }],
      totalPlaytimeSeconds: 3600,
      distinctGamesCount: 1,
    });
  });

  it('não vaza e-mail nem qualquer dado da biblioteca de ROMs', async () => {
    const resposta = await buscarPerfil(dona.handle);

    expect(resposta.statusCode).toBe(200);
    const bruto = resposta.json<Record<string, unknown>>();
    expect(bruto).not.toHaveProperty('email');
    expect(bruto).not.toHaveProperty('roms');
    expect(bruto).not.toHaveProperty('library');
  });

  it('handle inexistente dá 404 claro', async () => {
    const resposta = await buscarPerfil(`handle-que-nao-existe-${randomUUID().slice(0, 8)}`);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json<{ code: string }>().code).toBe('NOT_FOUND');
  });

  it('conta com perfil público desligado dá o mesmo 404 de handle inexistente', async () => {
    // O mesmo código, mesmo status — a rota não pode virar oráculo de "este
    // handle existe, só está escondido".
    await prisma.user.update({ where: { id: donaId }, data: { publicProfile: false } });

    const resposta = await buscarPerfil(dona.handle);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json<{ code: string }>().code).toBe('NOT_FOUND');

    await prisma.user.update({ where: { id: donaId }, data: { publicProfile: true } });
  });
});
