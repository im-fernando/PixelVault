import Fastify, { type FastifyInstance } from 'fastify';
import { describe, expect, it } from 'vitest';
import type { ApiError } from '@pixelvault/contracts';
import { registerErrorHandler } from '../../../infrastructure/error-handler.js';
import { NotFoundError } from '../../../infrastructure/errors.js';
import { autorizarOuNaoEncontrado, autorizarOuProibido } from '../application/autorizar.js';
import { definirHabilidades, recurso } from '../domain/habilidades.js';

/**
 * Prova do mecanismo, não de uma rota.
 *
 * `library` e `progress` ainda não têm rota nenhuma (M3 e M4), então as rotas
 * abaixo existem só dentro deste arquivo: são o menor recorte capaz de
 * exercitar ponta a ponta o que os dois módulos vão fazer quando existirem —
 * buscar o recurso, checar a habilidade contra ele e, quando a checagem
 * falhar, responder como se o recurso não existisse. Nada disto é registrado
 * em `app.ts`, e nenhuma delas é rota de produção.
 *
 * O que está sendo verificado é justamente a indistinguibilidade: a resposta
 * de "a biblioteca é de outra pessoa" precisa ser byte a byte igual à de "não
 * existe biblioteca com esse id". Se um dia divergirem — no status, no código
 * ou no texto —, este teste quebra, e é isso que ele existe para vigiar.
 */
const DONO = 'usuario-1';
const INTRUSO = 'usuario-2';

/** A "linha no banco" que uma rota de verdade teria buscado. */
const BIBLIOTECAS: Record<string, { id: string; userId: string }> = {
  'biblioteca-existente': { id: 'biblioteca-existente', userId: DONO },
};

async function appDeTeste(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  registerErrorHandler(app);

  app.get<{ Params: { id: string }; Querystring: { como?: string } }>(
    '/biblioteca/:id',
    async (request) => {
      const habilidades = definirHabilidades({ id: request.query.como ?? INTRUSO, papel: 'user' });

      const biblioteca = BIBLIOTECAS[request.params.id];
      // Recurso ausente e recurso alheio saem pelo mesmo `NotFoundError`, com
      // o mesmo nome — é o que torna as duas respostas indistinguíveis.
      if (biblioteca === undefined) throw new NotFoundError('Biblioteca');
      autorizarOuNaoEncontrado(habilidades, 'read', recurso('Library', biblioteca), 'Biblioteca');

      return { library: biblioteca };
    },
  );

  // Uma ação sem regra nenhuma escrita para ela: ninguém pode administrar o
  // catálogo a não ser admin, e este handler monta a habilidade de um `user`.
  app.post('/catalogo', async () => {
    const habilidades = definirHabilidades({ id: INTRUSO, papel: 'user' });
    autorizarOuProibido(habilidades, 'create', 'Game');
    return { status: 'criado' };
  });

  await app.ready();
  return app;
}

/** O corpo sem o `requestId`, que muda a cada requisição por definição. */
function corpoComparavel(bruto: unknown): Omit<ApiError, 'requestId'> {
  const { requestId: _ignorado, ...resto } = bruto as ApiError;
  return resto;
}

describe('autorizarOuNaoEncontrado', () => {
  it('responde ao recurso alheio exatamente como responderia ao inexistente', async () => {
    const app = await appDeTeste();

    const alheio = await app.inject({ method: 'GET', url: '/biblioteca/biblioteca-existente' });
    const inexistente = await app.inject({ method: 'GET', url: '/biblioteca/nao-existe' });

    expect(alheio.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(corpoComparavel(alheio.json())).toEqual(corpoComparavel(inexistente.json()));
    expect(corpoComparavel(alheio.json())).toEqual({
      code: 'NOT_FOUND',
      message: 'Biblioteca não encontrado',
    });

    await app.close();
  });

  it('não responde 403, que confirmaria a existência do recurso', async () => {
    const app = await appDeTeste();

    const alheio = await app.inject({ method: 'GET', url: '/biblioteca/biblioteca-existente' });

    expect(alheio.statusCode).not.toBe(403);
    expect(alheio.json()).not.toMatchObject({ code: 'FORBIDDEN' });

    await app.close();
  });

  it('entrega o recurso ao dono', async () => {
    const app = await appDeTeste();

    const resposta = await app.inject({
      method: 'GET',
      url: `/biblioteca/biblioteca-existente?como=${DONO}`,
    });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ library: { id: 'biblioteca-existente', userId: DONO } });

    await app.close();
  });
});

describe('autorizarOuProibido', () => {
  it('recusa com 403 a ação sem recurso específico envolvido', async () => {
    const app = await appDeTeste();

    const resposta = await app.inject({ method: 'POST', url: '/catalogo' });

    expect(resposta.statusCode).toBe(403);
    expect(corpoComparavel(resposta.json())).toEqual({
      code: 'FORBIDDEN',
      message: 'Acesso negado',
    });

    await app.close();
  });
});
