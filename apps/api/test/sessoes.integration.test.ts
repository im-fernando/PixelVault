import { createHash, randomUUID } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { SessionListResponse, SessionSummary } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { chaveDeTentativa } from '../src/modules/identity/infrastructure/chave-de-tentativa.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const config = loadConfig({ ...process.env, NODE_ENV: 'test' });

/**
 * Integração de verdade: PostgreSQL real, app Fastify inteiro por `inject()`,
 * Argon2id de verdade. Sem mock de repositório — o ponto de metade destes
 * testes é justamente o que o banco faz (ou deixa de fazer) com o `WHERE`.
 *
 * "Dispositivo", aqui, é um cookie: cada login devolve um token diferente, e
 * mandar um ou outro nas chamadas seguintes é exatamente a diferença entre
 * dois navegadores.
 */
const SENHA = 'cavalo-bateria-grampo';

/**
 * Todo request deste arquivo sai deste IP. O rate limit da #49 conta por IP
 * no PostgreSQL, compartilhado, e os arquivos de teste rodam em paralelo
 * contra o mesmo banco: sem um endereço próprio, um arquivo comeria a cota
 * do outro. Faixa reservada para documentação (RFC 5737).
 */
const IP_DO_ARQUIVO = '198.51.100.30';
const emailsCriados: string[] = [];

function identidadeNova(prefixo: string): { email: string; handle: string } {
  const sufixo = randomUUID().slice(0, 8);
  const email = `teste-${prefixo}-${sufixo}@exemplo.test`;
  emailsCriados.push(email);
  return { email, handle: `teste-${prefixo}-${sufixo}` };
}

const conta = identidadeNova('sessoes');
const outraConta = identidadeNova('sessoes-alheia');
let contaId: string;
let outraContaId: string;

/** A senha viva da conta principal — a troca de senha mexe nela. */
let senhaAtual = SENHA;

let app: FastifyInstance;

type RespostaInjetada = Awaited<ReturnType<FastifyInstance['inject']>>;

function cookieDeSessao(resposta: RespostaInjetada): string | undefined {
  return resposta.cookies.find((cookie) => cookie.name === NOME_DO_COOKIE_DE_SESSAO)?.value;
}

/** O cookie de limpeza que o logout manda: mesmo nome, valor vazio, já vencido. */
function cookieDeLimpeza(
  resposta: RespostaInjetada,
): RespostaInjetada['cookies'][number] | undefined {
  return resposta.cookies.find(
    (cookie) => cookie.name === NOME_DO_COOKIE_DE_SESSAO && cookie.value === '',
  );
}

function comCookie(cookie?: string): {
  remoteAddress: string;
  cookies?: Record<string, string>;
} {
  return {
    remoteAddress: IP_DO_ARQUIVO,
    ...(cookie === undefined ? {} : { cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie } }),
  };
}

/** A tabela guarda HMAC, então o teste calcula a mesma chave da aplicação. */
async function limparContador(): Promise<void> {
  await prisma.authAttempt.deleteMany({
    where: {
      keyHash: {
        in: [IP_DO_ARQUIVO, conta.email, outraConta.email].map((valor) =>
          chaveDeTentativa(config.SESSION_SECRET, valor),
        ),
      },
    },
  });
}

/** Abre uma sessão nova e devolve o cookie dela — um "dispositivo". */
async function novoDispositivo(
  credenciais: { email: string; password: string } = { email: conta.email, password: senhaAtual },
): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: credenciais,
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(200);

  const cookie = cookieDeSessao(resposta);
  expect(cookie).toBeDefined();
  return cookie ?? '';
}

async function pedirMe(cookie?: string): Promise<RespostaInjetada> {
  return app.inject({ method: 'GET', url: '/api/auth/me', ...comCookie(cookie) });
}

async function listarSessoes(cookie?: string): Promise<RespostaInjetada> {
  return app.inject({ method: 'GET', url: '/api/auth/sessions', ...comCookie(cookie) });
}

async function deslogar(cookie?: string): Promise<RespostaInjetada> {
  return app.inject({ method: 'POST', url: '/api/auth/logout', ...comCookie(cookie) });
}

async function revogar(cookie: string, sessaoId: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'DELETE',
    url: `/api/auth/sessions/${sessaoId}`,
    ...comCookie(cookie),
  });
}

async function sairDosOutros(cookie?: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/sessions/revoke-others',
    ...comCookie(cookie),
  });
}

/** O id da linha em `sessions` correspondente a um cookie. */
async function idDaSessaoDoCookie(cookie: string): Promise<string> {
  const token = app.unsignCookie(cookie).value ?? '';
  const tokenHash = createHash('sha256').update(token).digest('hex');
  const sessao = await prisma.session.findUniqueOrThrow({ where: { tokenHash } });
  return sessao.id;
}

async function criarConta(
  criador: FastifyInstance,
  dados: { email: string; handle: string },
): Promise<void> {
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...dados, password: SENHA, termsAccepted: true },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(202);
}

beforeAll(async () => {
  // Antes de cadastrar: o contador de cadastro por IP é compartilhado e
  // sobrevive à execução anterior, então rodar a suíte duas vezes seguidas
  // esbarraria nele.
  await limparContador();

  const criador = await buildApp(config);
  await criarConta(criador, conta);
  await criarConta(criador, outraConta);
  await criador.close();

  contaId = (await prisma.user.findUniqueOrThrow({ where: { email: conta.email } })).id;
  outraContaId = (await prisma.user.findUniqueOrThrow({ where: { email: outraConta.email } })).id;
}, 60_000);

beforeEach(async () => {
  app = await buildApp(config);
  // Cada cenário conta sessões; sobra do anterior estragaria a contagem.
  await prisma.session.deleteMany({ where: { userId: { in: [contaId, outraContaId] } } });
  await limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await limparContador();
  // As sessões vão junto: a FK de `sessions` é `onDelete: Cascade`.
  await prisma.user.deleteMany({ where: { email: { in: emailsCriados } } });
  await prisma.$disconnect();
});

describe('POST /api/auth/logout', () => {
  it('encerra só o dispositivo que pediu; o outro continua logado', async () => {
    // O critério de aceite da issue #47, inteiro, em quatro linhas.
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();

    expect(await deslogar(celular)).toMatchObject({ statusCode: 200 });

    expect((await pedirMe(celular)).statusCode).toBe(401);
    expect((await pedirMe(desktop)).statusCode).toBe(200);
    expect(await prisma.session.count({ where: { userId: contaId } })).toBe(1);
  }, 60_000);

  it('apaga o cookie com os mesmos atributos usados para setá-lo', async () => {
    // Cookie apagado com `path` diferente do original vira um segundo cookie
    // vazio e deixa o de verdade no navegador: logout que "funciona" no
    // servidor e não no cliente.
    const cookie = await novoDispositivo();

    const limpeza = cookieDeLimpeza(await deslogar(cookie));

    expect(limpeza).toBeDefined();
    expect(limpeza?.path).toBe('/');
    expect(limpeza?.httpOnly).toBe(true);
    expect(limpeza?.sameSite?.toLowerCase()).toBe('lax');
    expect(limpeza?.secure).toBe(true);
    expect(limpeza?.expires?.getTime()).toBeLessThanOrEqual(Date.now());
  }, 60_000);

  it('responde 200 sem sessão nenhuma e é idempotente', async () => {
    // Quem pede para sair e já estava fora conseguiu o que queria. Um 401 aqui
    // obrigaria o front a tratar um erro sem tratamento possível.
    expect((await deslogar()).statusCode).toBe(200);
    expect((await deslogar('lixo-que-nao-e-cookie')).statusCode).toBe(200);

    const cookie = await novoDispositivo();
    expect((await deslogar(cookie)).statusCode).toBe(200);
    expect((await deslogar(cookie)).statusCode).toBe(200);
  }, 60_000);
});

describe('GET /api/auth/sessions', () => {
  it('lista as sessões vivas marcando qual é a de quem perguntou', async () => {
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();
    const idCelular = await idDaSessaoDoCookie(celular);
    const idDesktop = await idDaSessaoDoCookie(desktop);

    const doCelular = (await listarSessoes(celular)).json<SessionListResponse>().sessions;
    const doDesktop = (await listarSessoes(desktop)).json<SessionListResponse>().sessions;

    const atual = (sessoes: SessionSummary[]): string | undefined =>
      sessoes.find((sessao) => sessao.current)?.id;

    expect(doCelular).toHaveLength(2);
    expect(doDesktop).toHaveLength(2);
    // A mesma lista para os dois; muda só qual linha está marcada.
    expect(doCelular.map((sessao) => sessao.id).sort()).toEqual([idCelular, idDesktop].sort());
    expect(atual(doCelular)).toBe(idCelular);
    expect(atual(doDesktop)).toBe(idDesktop);
    expect(doCelular.filter((sessao) => sessao.current)).toHaveLength(1);
  }, 60_000);

  it('devolve dispositivo aproximado e datas, nunca o token nem o hash dele', async () => {
    const cookie = await novoDispositivo();
    const linha = await prisma.session.findFirstOrThrow({ where: { userId: contaId } });

    const resposta = await listarSessoes(cookie);
    const [sessao] = resposta.json<SessionListResponse>().sessions;

    expect(Object.keys(sessao ?? {}).sort()).toEqual([
      'createdAt',
      'current',
      'id',
      'ipTruncated',
      'lastSeenAt',
      'userAgent',
    ]);
    expect(resposta.body).not.toContain(linha.tokenHash);
    expect(resposta.body).not.toContain(app.unsignCookie(cookie).value);
    expect(Date.parse(sessao?.createdAt ?? '')).not.toBeNaN();
  }, 60_000);

  it('não enxerga sessão de outra conta', async () => {
    const minha = await novoDispositivo();
    await novoDispositivo({ email: outraConta.email, password: SENHA });

    const listadas = (await listarSessoes(minha)).json<SessionListResponse>().sessions;

    expect(listadas).toHaveLength(1);
    expect(listadas[0]?.id).toBe(await idDaSessaoDoCookie(minha));
  }, 60_000);

  it('responde 401 sem sessão', async () => {
    expect((await listarSessoes()).statusCode).toBe(401);
  });
});

describe('DELETE /api/auth/sessions/:id', () => {
  it('revoga a sessão escolhida e deixa as outras de pé', async () => {
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();

    const resposta = await revogar(desktop, await idDaSessaoDoCookie(celular));

    expect(resposta.statusCode).toBe(200);
    expect((await pedirMe(celular)).statusCode).toBe(401);
    expect((await pedirMe(desktop)).statusCode).toBe(200);
  }, 60_000);

  it('responde 404 igualzinho para sessão de outra pessoa e para id inexistente', async () => {
    // O ponto da issue: um 403 na primeira e um 404 na segunda confirmariam
    // que aquele id existe. Quem varre ids de sessão alheia não pode arrancar
    // nem essa informação — e por isso as duas respostas são comparadas
    // inteiras, não só pelo status.
    const minha = await novoDispositivo();
    const alheia = await novoDispositivo({ email: outraConta.email, password: SENHA });

    const daOutraPessoa = await revogar(minha, await idDaSessaoDoCookie(alheia));
    const inexistente = await revogar(minha, randomUUID());

    const semRequestId = (resposta: RespostaInjetada): unknown => {
      const { requestId: _ignorado, ...resto } = resposta.json<Record<string, unknown>>();
      return resto;
    };

    expect(daOutraPessoa.statusCode).toBe(404);
    expect(inexistente.statusCode).toBe(404);
    expect(semRequestId(daOutraPessoa)).toEqual(semRequestId(inexistente));

    // E a sessão alheia continua de pé: 404 não é "recusei", é "não existe
    // para você" — e ela de fato não pode ter sido tocada.
    expect((await pedirMe(alheia)).statusCode).toBe(200);
  }, 60_000);

  it('permite revogar a própria sessão atual, apagando o cookie junto', async () => {
    const cookie = await novoDispositivo();

    const resposta = await revogar(cookie, await idDaSessaoDoCookie(cookie));

    expect(resposta.statusCode).toBe(200);
    expect(cookieDeLimpeza(resposta)).toBeDefined();
    expect((await pedirMe(cookie)).statusCode).toBe(401);
  }, 60_000);

  it('responde 401 sem sessão, sem chegar a olhar o id', async () => {
    const cookie = await novoDispositivo();
    const id = await idDaSessaoDoCookie(cookie);

    const resposta = await app.inject({ method: 'DELETE', url: `/api/auth/sessions/${id}` });

    expect(resposta.statusCode).toBe(401);
    expect((await pedirMe(cookie)).statusCode).toBe(200);
  }, 60_000);
});

describe('POST /api/auth/sessions/revoke-others', () => {
  it('derruba todos os outros aparelhos e preserva o que pediu', async () => {
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();
    const tablet = await novoDispositivo();

    const resposta = await sairDosOutros(desktop);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'sessoes-revogadas', revoked: 2 });
    expect((await pedirMe(desktop)).statusCode).toBe(200);
    expect((await pedirMe(celular)).statusCode).toBe(401);
    expect((await pedirMe(tablet)).statusCode).toBe(401);
    expect(await prisma.session.count({ where: { userId: contaId } })).toBe(1);
  }, 60_000);

  it('não toca nas sessões de outras contas', async () => {
    const minha = await novoDispositivo();
    const alheia = await novoDispositivo({ email: outraConta.email, password: SENHA });

    expect((await sairDosOutros(minha)).json()).toMatchObject({ revoked: 0 });
    expect((await pedirMe(alheia)).statusCode).toBe(200);
  }, 60_000);
});

describe('POST /api/auth/change-password', () => {
  async function trocar(
    cookie: string | undefined,
    corpo: { currentPassword: string; newPassword: string },
  ): Promise<RespostaInjetada> {
    return app.inject({
      method: 'POST',
      url: '/api/auth/change-password',
      payload: corpo,
      ...comCookie(cookie),
    });
  }

  it('derruba as outras sessões e mantém viva a que trocou a senha', async () => {
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();
    const senhaNova = `nova-${randomUUID()}`;

    const resposta = await trocar(desktop, {
      currentPassword: senhaAtual,
      newPassword: senhaNova,
    });
    senhaAtual = senhaNova;

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'senha-alterada', revokedSessions: 1 });
    // Quem trocou continua dentro; quem estava em outro aparelho, não.
    expect((await pedirMe(desktop)).statusCode).toBe(200);
    expect((await pedirMe(celular)).statusCode).toBe(401);

    // E a senha nova é a que vale a partir de agora — `novoDispositivo`
    // afirma o 200 do login por dentro.
    expect(await novoDispositivo({ email: conta.email, password: senhaNova })).not.toBe('');
  }, 120_000);

  it('recusa com 422 quem erra a senha atual, sem derrubar sessão nenhuma', async () => {
    const celular = await novoDispositivo();
    const desktop = await novoDispositivo();

    const resposta = await trocar(desktop, {
      currentPassword: 'nao-e-a-senha-atual',
      newPassword: `nova-${randomUUID()}`,
    });

    // 422 e não 401: 401 faria o front deslogar quem apenas errou a digitação.
    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { currentPassword: ['SENHA_ATUAL_INCORRETA'] },
    });
    expect((await pedirMe(celular)).statusCode).toBe(200);
    expect((await pedirMe(desktop)).statusCode).toBe(200);
  }, 60_000);

  it('responde 401 sem sessão', async () => {
    const resposta = await trocar(undefined, {
      currentPassword: senhaAtual,
      newPassword: `nova-${randomUUID()}`,
    });

    expect(resposta.statusCode).toBe(401);
  }, 60_000);
});

describe('limpeza de sessões expiradas', () => {
  /** Uma linha vencida plantada direto no banco — esperar 30 dias não é opção. */
  async function plantarSessaoVencida(): Promise<{ id: string; cookie: string }> {
    const token = `token-vencido-${randomUUID()}`;
    const linha = await prisma.session.create({
      data: {
        userId: contaId,
        tokenHash: createHash('sha256').update(token).digest('hex'),
        expiresAt: new Date(Date.now() - 60_000),
        userAgent: 'navegador-fossilizado',
        ipTruncated: '203.0.113.0',
      },
    });
    return { id: linha.id, cookie: app.signCookie(token) };
  }

  it('apaga a sessão vencida quando alguém a apresenta em vez de só recusá-la', async () => {
    const { id, cookie } = await plantarSessaoVencida();

    expect((await pedirMe(cookie)).statusCode).toBe(401);

    expect(await prisma.session.findUnique({ where: { id } })).toBeNull();
  }, 60_000);

  it('poda as vencidas da pessoa antes de listar, então elas não aparecem', async () => {
    const { id } = await plantarSessaoVencida();
    const viva = await novoDispositivo();

    const listadas = (await listarSessoes(viva)).json<SessionListResponse>().sessions;

    expect(listadas.map((sessao) => sessao.id)).toEqual([await idDaSessaoDoCookie(viva)]);
    expect(await prisma.session.findUnique({ where: { id } })).toBeNull();
  }, 60_000);
});
