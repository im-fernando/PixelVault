import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { DURACAO_DA_SESSAO_MS, NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const config = loadConfig({ ...process.env, NODE_ENV: 'test' });

/**
 * Integração de verdade: PostgreSQL real, app Fastify inteiro por
 * `inject()`, Argon2id de verdade. O Argon2 rodando de verdade não é
 * detalhe: o teste mais importante deste arquivo mede tempo, e com hash
 * falso não haveria tempo nenhum para medir.
 */
const SENHA = 'cavalo-bateria-grampo';
const emailsCriados: string[] = [];

function identidadeNova(prefixo: string): { email: string; handle: string } {
  const sufixo = randomUUID().slice(0, 8);
  const email = `teste-${prefixo}-${sufixo}@exemplo.test`;
  emailsCriados.push(email);
  return { email, handle: `teste-${prefixo}-${sufixo}` };
}

const conta = identidadeNova('login');
let contaId: string;

let app: FastifyInstance;

async function logar(credenciais: { email: string; password: string }): Promise<RespostaInjetada> {
  return app.inject({ method: 'POST', url: '/api/auth/login', payload: credenciais });
}

/** `GET /api/auth/me` mandando (ou não) o cookie de sessão. */
async function pedirMe(cookie?: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: '/api/auth/me',
    ...(cookie === undefined ? {} : { cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie } }),
  });
}

// O tipo da resposta de `inject()` vem do próprio Fastify: `light-my-request`
// é dependência transitiva e não está no node_modules deste pacote.
type RespostaInjetada = Awaited<ReturnType<typeof pedirMe>>;

function cookieDeSessao(
  resposta: RespostaInjetada,
): RespostaInjetada['cookies'][number] | undefined {
  return resposta.cookies.find((cookie) => cookie.name === NOME_DO_COOKIE_DE_SESSAO);
}

/** O corpo do erro sem o `requestId`, que muda a cada requisição. */
function corpoComparavel(resposta: RespostaInjetada): unknown {
  const { requestId: _ignorado, ...resto } = resposta.json<Record<string, unknown>>();
  return resto;
}

beforeAll(async () => {
  const criador = await buildApp(config);
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...conta, password: SENHA, termsAccepted: true },
  });
  expect(resposta.statusCode).toBe(202);
  await criador.close();

  const usuario = await prisma.user.findUniqueOrThrow({ where: { email: conta.email } });
  contaId = usuario.id;
}, 30_000);

beforeEach(async () => {
  app = await buildApp(config);
  // Cada cenário conta e inspeciona as sessões da conta de teste; sobra de
  // um cenário anterior estragaria a contagem do seguinte.
  await prisma.session.deleteMany({ where: { userId: contaId } });
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  // As sessões vão junto: a FK de `sessions` é `onDelete: Cascade`.
  await prisma.user.deleteMany({ where: { email: { in: emailsCriados } } });
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  it('abre sessão e devolve o usuário, sem nunca ecoar o token no corpo', async () => {
    const antes = Date.now();
    const resposta = await logar({ email: conta.email, password: SENHA });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      user: {
        id: contaId,
        email: conta.email,
        handle: conta.handle,
        displayName: expect.any(String),
      },
    });

    const cookie = cookieDeSessao(resposta);
    expect(cookie).toBeDefined();
    // O cookie é a única saída do token. O corpo da resposta não pode
    // conter nada parecido com ele.
    expect(resposta.body).not.toContain(cookie?.value);

    const sessoes = await prisma.session.findMany({ where: { userId: contaId } });
    expect(sessoes).toHaveLength(1);
    expect(sessoes[0]?.expiresAt.getTime()).toBeGreaterThan(antes + DURACAO_DA_SESSAO_MS - 60_000);
  }, 30_000);

  it('manda o cookie httpOnly, Secure e SameSite=Lax', async () => {
    const cookie = cookieDeSessao(await logar({ email: conta.email, password: SENHA }));

    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite?.toLowerCase()).toBe('lax');
    expect(cookie?.path).toBe('/');
    // `Secure` cai só em desenvolvimento; este teste roda com NODE_ENV=test.
    expect(cookie?.secure).toBe(true);
    expect(cookie?.expires?.getTime()).toBeGreaterThan(Date.now() + DURACAO_DA_SESSAO_MS - 60_000);
  }, 30_000);

  it('guarda o hash do token, nunca o token que foi para o cookie', async () => {
    const resposta = await logar({ email: conta.email, password: SENHA });
    const assinado = cookieDeSessao(resposta)?.value ?? '';
    const token = app.unsignCookie(assinado).value ?? '';

    const sessao = await prisma.session.findFirstOrThrow({ where: { userId: contaId } });

    expect(token).not.toBe('');
    expect(sessao.tokenHash).not.toBe(token);
    expect(sessao.tokenHash).not.toBe(assinado);
    expect(sessao.tokenHash).toBe(createHash('sha256').update(token).digest('hex'));
  }, 30_000);

  it('cria uma sessão nova a cada login, sem reaproveitar a anterior', async () => {
    // Fixação de sessão: como o servidor nunca reaproveita identificador,
    // não há sessão pré-existente para um atacante plantar. Ver ADR 0017.
    const primeira = await logar({ email: conta.email, password: SENHA });
    const segunda = await logar({ email: conta.email, password: SENHA });

    expect(cookieDeSessao(primeira)?.value).not.toBe(cookieDeSessao(segunda)?.value);
    expect(await prisma.session.count({ where: { userId: contaId } })).toBe(2);
  }, 30_000);

  it('responde a senha errada exatamente como responde a e-mail inexistente', async () => {
    const senhaErrada = await logar({ email: conta.email, password: 'nao-e-a-senha-certa' });
    const inexistente = await logar({
      email: `nao-existe-${randomUUID()}@exemplo.test`,
      password: SENHA,
    });

    expect(senhaErrada.statusCode).toBe(401);
    expect(inexistente.statusCode).toBe(401);
    expect(corpoComparavel(inexistente)).toEqual(corpoComparavel(senhaErrada));
    expect(corpoComparavel(senhaErrada)).toEqual({
      code: 'UNAUTHENTICATED',
      message: 'E-mail ou senha incorretos',
      details: { credentials: ['CREDENCIAIS_INVALIDAS'] },
    });

    // E nenhuma das duas pode ter aberto sessão.
    expect(cookieDeSessao(senhaErrada)).toBeUndefined();
    expect(cookieDeSessao(inexistente)).toBeUndefined();
  }, 30_000);

  /**
   * O teste que dá sentido ao hash descartável.
   *
   * Se o caminho do e-mail inexistente pulasse o Argon2id, ele responderia
   * em poucos milissegundos contra os ~330 ms do caminho que verifica uma
   * senha de verdade — e a diferença entre as médias seria da ordem do
   * próprio custo do hash (perto de 100% dele). O limiar aqui é 25% do custo
   * médio de uma requisição: folgado o bastante para não piscar em CI
   * ruidoso, e ainda assim quatro vezes menor que o sinal que denunciaria a
   * otimização indevida.
   */
  it('leva o mesmo tempo para recusar e-mail inexistente e senha errada', async () => {
    const REPETICOES = 8;

    async function medir(payload: { email: string; password: string }): Promise<number> {
      const inicio = performance.now();
      await logar(payload);
      return performance.now() - inicio;
    }

    const senhaErrada = { email: conta.email, password: 'nao-e-a-senha-certa' };
    const inexistente = (): { email: string; password: string } => ({
      email: `nao-existe-${randomUUID()}@exemplo.test`,
      password: SENHA,
    });

    // Aquecimento: a primeira chamada ao binding nativo do Argon2 e o
    // primeiro plano de consulta do Postgres pagam um pedágio que não é da
    // conta deste teste.
    await medir(senhaErrada);
    await medir(inexistente());

    const temposSenhaErrada: number[] = [];
    const temposInexistente: number[] = [];
    for (let i = 0; i < REPETICOES; i += 1) {
      // Alterna a ordem: se houvesse deriva da máquina ao longo do teste,
      // medir sempre um caminho primeiro a jogaria toda para o mesmo lado.
      if (i % 2 === 0) {
        temposSenhaErrada.push(await medir(senhaErrada));
        temposInexistente.push(await medir(inexistente()));
      } else {
        temposInexistente.push(await medir(inexistente()));
        temposSenhaErrada.push(await medir(senhaErrada));
      }
    }

    const media = (valores: number[]): number =>
      valores.reduce((soma, valor) => soma + valor, 0) / valores.length;

    const mediaSenhaErrada = media(temposSenhaErrada);
    const mediaInexistente = media(temposInexistente);
    const diferenca = Math.abs(mediaSenhaErrada - mediaInexistente);
    const custoMedio = (mediaSenhaErrada + mediaInexistente) / 2;

    const medido =
      `senha errada ${mediaSenhaErrada.toFixed(1)} ms x inexistente ` +
      `${mediaInexistente.toFixed(1)} ms (diferença ${diferenca.toFixed(1)} ms, ` +
      `custo médio ${custoMedio.toFixed(1)} ms)`;

    // Sanidade: se o custo médio fosse baixo, o Argon2 não estaria rodando e
    // a asserção seguinte não provaria nada.
    expect(custoMedio, medido).toBeGreaterThan(100);
    expect(diferenca, medido).toBeLessThan(custoMedio * 0.25);
  }, 120_000);
});

describe('GET /api/auth/me', () => {
  async function sessaoValida(): Promise<string> {
    const resposta = await logar({ email: conta.email, password: SENHA });
    return cookieDeSessao(resposta)?.value ?? '';
  }

  it('devolve o usuário da sessão, sem nada derivado de senha', async () => {
    const resposta = await pedirMe(await sessaoValida());

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      user: {
        id: contaId,
        email: conta.email,
        handle: conta.handle,
        displayName: expect.any(String),
      },
    });
    expect(resposta.body).not.toContain('argon2');
  }, 30_000);

  it('responde 401 sem cookie nenhum', async () => {
    const resposta = await pedirMe();

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('responde 401 para cookie inventado, adulterado ou vazio — nunca 500', async () => {
    const valido = await sessaoValida();
    const adulterado = `${valido.slice(0, -3)}xyz`;

    for (const valor of ['', 'lixo', 'nao.assinado.direito', adulterado]) {
      const resposta = await pedirMe(valor);
      expect(resposta.statusCode).toBe(401);
    }
  }, 30_000);

  it('responde 401 para sessão expirada', async () => {
    const cookie = await sessaoValida();
    await prisma.session.updateMany({
      where: { userId: contaId },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const resposta = await pedirMe(cookie);

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  }, 30_000);

  it('não mexe na sessão enquanto sobra mais da metade do prazo', async () => {
    const cookie = await sessaoValida();
    const antes = await prisma.session.findFirstOrThrow({ where: { userId: contaId } });

    const resposta = await pedirMe(cookie);
    expect(resposta.statusCode).toBe(200);

    const depois = await prisma.session.findUniqueOrThrow({ where: { id: antes.id } });
    expect(depois.expiresAt).toEqual(antes.expiresAt);
    expect(depois.lastSeenAt).toEqual(antes.lastSeenAt);
    // Sem renovação, sem cookie novo na resposta.
    expect(cookieDeSessao(resposta)).toBeUndefined();
  }, 30_000);

  it('desliza a sessão quando resta menos da metade do prazo', async () => {
    const cookie = await sessaoValida();
    const sessao = await prisma.session.findFirstOrThrow({ where: { userId: contaId } });

    const quaseVencendo = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const usoAntigo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000);
    await prisma.session.update({
      where: { id: sessao.id },
      data: { expiresAt: quaseVencendo, lastSeenAt: usoAntigo },
    });

    const resposta = await pedirMe(cookie);
    expect(resposta.statusCode).toBe(200);

    const renovada = await prisma.session.findUniqueOrThrow({ where: { id: sessao.id } });
    expect(renovada.expiresAt.getTime()).toBeGreaterThan(
      Date.now() + DURACAO_DA_SESSAO_MS - 60_000,
    );
    expect(renovada.lastSeenAt.getTime()).toBeGreaterThan(usoAntigo.getTime());

    // O navegador precisa saber da validade nova, senão descartaria o
    // cookie na data antiga enquanto o servidor ainda o aceita.
    const cookieRenovado = cookieDeSessao(resposta);
    expect(cookieRenovado?.value).toBe(cookie);
    expect(cookieRenovado?.expires?.getTime()).toBeGreaterThan(quaseVencendo.getTime());
  }, 30_000);
});
