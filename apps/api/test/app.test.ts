import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

const config = loadConfig({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://irrelevante/para/este/teste',
  SESSION_SECRET: 'x'.repeat(48),
});

/**
 * Teste da borda HTTP por inject(): exercita o Fastify inteiro — plugins,
 * validação, serialização e error handler — sem abrir porta e sem banco.
 * Só rotas que não tocam o repositório entram aqui; o que consulta o
 * PostgreSQL é teste de integração e sobe banco de verdade.
 */
describe('app', () => {
  it('responde /health', async () => {
    const app = await buildApp(config);
    const resposta = await app.inject({ method: 'GET', url: '/health' });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('recusa querystring inválida com código estável e detalhe por campo', async () => {
    const app = await buildApp(config);
    const resposta = await app.inject({ method: 'GET', url: '/api/games?systemId=dreamcast' });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { systemId: expect.any(Array) },
    });
    await app.close();
  });

  it('registra as rotas do catálogo no OpenAPI', async () => {
    const app = await buildApp(config);
    const resposta = await app.inject({ method: 'GET', url: '/docs/json' });

    expect(Object.keys(resposta.json().paths)).toEqual(
      expect.arrayContaining(['/health', '/api/games', '/api/games/{slug}']),
    );
    await app.close();
  });
});

describe('loadConfig', () => {
  it('recusa SESSION_SECRET curto com mensagem acionável', () => {
    expect(() =>
      loadConfig({ DATABASE_URL: 'postgres://x', SESSION_SECRET: 'curto' }),
    ).toThrowError(/SESSION_SECRET/);
  });

  it('recusa ausência de DATABASE_URL', () => {
    expect(() => loadConfig({ SESSION_SECRET: 'x'.repeat(48) })).toThrowError(/DATABASE_URL/);
  });
});
