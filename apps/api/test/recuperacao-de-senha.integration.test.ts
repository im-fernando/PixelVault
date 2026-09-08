import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { LIMITES } from '../src/modules/identity/domain/limite-de-tentativas.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { buildApp } from '../src/app.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * O fluxo inteiro de "esqueci minha senha", contra PostgreSQL de verdade e
 * pelo adaptador de e-mail de desenvolvimento — que é literalmente o critério
 * de aceite da #51: pedir, receber o link, redefinir, e o token não funcionar
 * uma segunda vez.
 *
 * O link é lido do console, e isso não é gambiarra de teste: em
 * desenvolvimento é exatamente ali que ele aparece, então o que este arquivo
 * exercita é o caminho que uma pessoa percorre na máquina dela, com o mesmo
 * adaptador. Nada aqui é substituído por dublê — nem o repositório, nem o
 * Argon2id, nem o contador de tentativas.
 *
 * `NODE_ENV=test` escolhe o transporte `console` pela mesma regra que o
 * escolhe em desenvolvimento (ver `config.ts`), então o teste não precisa —
 * nem pode — configurar isso por fora.
 */
const SENHA = 'cavalo-bateria-grampo';
const SENHA_NOVA = 'quatro-palavras-sao-melhores';

/**
 * IPs próprios deste arquivo. O contador de tentativas mora no PostgreSQL e é
 * compartilhado entre os arquivos de teste, que rodam em paralelo: sem
 * endereços próprios, um comeria a cota do outro. Faixa reservada para
 * documentação (RFC 5737).
 */
const IP_CADASTRO = '198.51.100.40';
const IP_DO_ARQUIVO = '198.51.100.41';
const IP_DO_LIMITE = '198.51.100.42';

const EMAIL_SEM_CONTA = 'ninguem-tem-esta-conta@exemplo.test';

/**
 * Identidades novas a cada execução, e as chaves que este arquivo suja no
 * contador. Zeradas antes de cada cenário porque o limite por e-mail da
 * recuperação é estreito de propósito (três por hora), e quatro cenários
 * pedem o link da mesma conta. Ver test/suporte/rastro.ts.
 */
const rastro = rastroDeTeste(IP_CADASTRO, IP_DO_ARQUIVO, IP_DO_LIMITE, EMAIL_SEM_CONTA);

const conta = rastro.identidadeNova('rec');
const contaDoLimite = rastro.identidadeNova('rec-lim');

/** A senha viva da conta principal — cada redefinição a troca. */
let senhaAtual = SENHA;
let contaId: string;

let app: FastifyInstance;
let linhasDoConsole: string[];

async function limparEstado(): Promise<void> {
  await rastro.limparContador();
  // Token de um cenário não pode sobrar para o próximo achar por engano: as
  // asserções procuram "o token desta conta", e duas linhas fariam a busca
  // encontrar a errada sem falhar.
  await prisma.passwordResetToken.deleteMany({
    where: { user: { email: { in: [...rastro.emails] } } },
  });
  // Sessão de um cenário também não sobra: o cenário que conta quantas caem
  // precisa saber quantas existiam, e login de teste anterior somaria à
  // conta sem quebrar nada visivelmente.
  await prisma.session.deleteMany({ where: { user: { email: { in: [...rastro.emails] } } } });
}

type RespostaInjetada = Awaited<ReturnType<FastifyInstance['inject']>>;

function pedirRecuperacao(email: string, ip = IP_DO_ARQUIVO): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/forgot-password',
    payload: { email },
    remoteAddress: ip,
  });
}

function redefinir(token: string, password: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/reset-password',
    payload: { token, password },
    remoteAddress: IP_DO_ARQUIVO,
  });
}

function logar(email: string, password: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email, password },
    remoteAddress: IP_DO_ARQUIVO,
  });
}

function cookieDeSessao(resposta: RespostaInjetada): string {
  const cookie = resposta.cookies.find((c) => c.name === NOME_DO_COOKIE_DE_SESSAO)?.value;
  if (cookie === undefined) throw new Error('a resposta não trouxe cookie de sessão');
  return cookie;
}

function sessaoAindaVale(cookie: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: '/api/auth/me',
    remoteAddress: IP_DO_ARQUIVO,
    cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie },
  });
}

/**
 * O token, lido do link que o adaptador de console imprimiu.
 *
 * Ler do console e não do banco é deliberado: o banco só tem o hash — que é
 * justamente a garantia que a issue pede — então o único lugar do mundo onde
 * o token em claro existe depois do envio é a mensagem. Se este teste
 * conseguisse pegá-lo de outro lugar, a garantia estaria quebrada.
 */
function tokenDoUltimoEmail(): string {
  const link = linhasDoConsole
    .join('\n')
    .split(/\s+/)
    .findLast((pedaco) => pedaco.includes('/redefinir-senha?token='));

  if (link === undefined) throw new Error('nenhum link de redefinição saiu no console');
  const token = new URL(link).searchParams.get('token');
  if (token === null) throw new Error(`link sem token: ${link}`);
  return token;
}

beforeAll(async () => {
  const criador = await buildApp(configDeTeste);
  for (const identidade of [conta, contaDoLimite]) {
    const resposta = await criador.inject({
      method: 'POST',
      url: '/api/auth/register',
      payload: { ...identidade, password: SENHA, termsAccepted: true },
      remoteAddress: IP_CADASTRO,
    });
    expect(resposta.statusCode).toBe(202);
  }
  await criador.close();

  const criada = await prisma.user.findUnique({
    where: { email: conta.email },
    select: { id: true },
  });
  contaId = criada?.id ?? '';
  expect(contaId).not.toBe('');
}, 120_000);

beforeEach(async () => {
  linhasDoConsole = [];
  // O adaptador de desenvolvimento escreve com `console.log`; interceptá-lo é
  // o equivalente a abrir a caixa de entrada.
  vi.spyOn(console, 'log').mockImplementation((...partes: unknown[]) => {
    linhasDoConsole.push(partes.map(String).join(' '));
  });

  app = await buildApp(configDeTeste);
  await limparEstado();

  return async () => {
    await app.close();
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await limparEstado();
  await rastro.limpar();
});

describe('POST /api/auth/forgot-password', () => {
  it('responde igual para e-mail com conta e para e-mail sem conta', async () => {
    const semConta = await pedirRecuperacao(EMAIL_SEM_CONTA);
    const comConta = await pedirRecuperacao(conta.email);

    expect(semConta.statusCode).toBe(202);
    expect(comConta.statusCode).toBe(semConta.statusCode);
    expect(comConta.json()).toEqual(semConta.json());
    expect(comConta.json()).toEqual({ status: 'recuperacao-solicitada' });
  });

  it('não grava token nenhum para e-mail sem conta', async () => {
    const antes = await prisma.passwordResetToken.count();

    await pedirRecuperacao(EMAIL_SEM_CONTA);

    // E não manda e-mail: a API não é disparador de mensagem para qualquer
    // endereço que alguém digite.
    expect(await prisma.passwordResetToken.count()).toBe(antes);
    expect(linhasDoConsole.join('\n')).not.toContain('/redefinir-senha?token=');
  });

  it('guarda o token como hash, nunca em claro', async () => {
    await pedirRecuperacao(conta.email);
    const token = tokenDoUltimoEmail();

    const guardado = await prisma.passwordResetToken.findFirst({
      where: { userId: contaId },
      select: { tokenHash: true, expiresAt: true },
    });

    expect(guardado).not.toBeNull();
    expect(guardado?.tokenHash).not.toBe(token);
    // Nem sequer contém: um dump da tabela não pode virar redefinição alheia.
    expect(guardado?.tokenHash).not.toContain(token);
    expect(await prisma.passwordResetToken.count({ where: { tokenHash: token } })).toBe(0);
  });
});

describe('o fluxo completo do critério de aceite', () => {
  it('pede, recebe o link, redefine — e o token não funciona uma segunda vez', async () => {
    expect((await pedirRecuperacao(conta.email)).statusCode).toBe(202);
    const token = tokenDoUltimoEmail();

    const primeira = await redefinir(token, SENHA_NOVA);
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json()).toMatchObject({ status: 'senha-redefinida' });
    senhaAtual = SENHA_NOVA;

    // A senha nova vale...
    expect((await logar(conta.email, SENHA_NOVA)).statusCode).toBe(200);
    // ...e a antiga não vale mais.
    expect((await logar(conta.email, SENHA)).statusCode).toBe(401);

    // O uso único, que é a metade da issue que mais fácil se implementa
    // errado: repetir a mesma requisição precisa falhar como se o token
    // jamais tivesse existido.
    const segunda = await redefinir(token, 'outra-senha-bem-comprida');
    expect(segunda.statusCode).toBe(422);
    expect(segunda.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { token: ['TOKEN_INVALIDO'] },
    });

    // E a senha continua sendo a que a primeira redefinição gravou.
    expect((await logar(conta.email, 'outra-senha-bem-comprida')).statusCode).toBe(401);
    expect((await logar(conta.email, SENHA_NOVA)).statusCode).toBe(200);
  }, 60_000);

  it('recusa token inventado do mesmo jeito que recusa token gasto', async () => {
    const resposta = await redefinir('token-que-ninguem-nunca-emitiu', 'senha-longa-o-bastante');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ details: { token: ['TOKEN_INVALIDO'] } });
  });

  it('recusa token vencido', async () => {
    await pedirRecuperacao(conta.email);
    const token = tokenDoUltimoEmail();

    // Envelhecer a linha é a única forma honesta de testar isto sem esperar
    // meia hora: o relógio que decide é o do PostgreSQL, no mesmo `WHERE` do
    // hash, então é a coluna que precisa mudar.
    await prisma.passwordResetToken.updateMany({
      where: { userId: contaId },
      data: { expiresAt: new Date(Date.now() - 1_000) },
    });

    const resposta = await redefinir(token, 'mais-uma-senha-comprida');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ details: { token: ['TOKEN_INVALIDO'] } });
    expect((await logar(conta.email, senhaAtual)).statusCode).toBe(200);
  }, 60_000);

  it('não gasta o token quando a senha oferecida não passa na política', async () => {
    await pedirRecuperacao(conta.email);
    const token = tokenDoUltimoEmail();

    // Uma senha longa o bastante para passar pelo Zod da borda e reprovada
    // pelo domínio, que é onde a política de verdade mora: é ela que exercita
    // a ordem "valida a senha ANTES de gastar o token".
    const comum = await redefinir(token, 'password1234');
    expect(comum.statusCode).toBe(422);
    expect(comum.json()).toMatchObject({ details: { password: ['SENHA_COMUM'] } });

    // O mesmo link ainda serve: quem errou a senha nova não deve precisar
    // pedir outro e-mail para consertar a própria digitação.
    const boa = await redefinir(token, 'senha-nova-de-verdade-longa');
    expect(boa.statusCode).toBe(200);
    senhaAtual = 'senha-nova-de-verdade-longa';
  }, 60_000);
});

describe('redefinir derruba todas as sessões', () => {
  it('encerra as sessões abertas em todos os aparelhos, sem poupar nenhuma', async () => {
    const primeiroAparelho = cookieDeSessao(await logar(conta.email, senhaAtual));
    const segundoAparelho = cookieDeSessao(await logar(conta.email, senhaAtual));

    expect((await sessaoAindaVale(primeiroAparelho)).statusCode).toBe(200);
    expect((await sessaoAindaVale(segundoAparelho)).statusCode).toBe(200);

    await pedirRecuperacao(conta.email);
    const resposta = await redefinir(tokenDoUltimoEmail(), 'terceira-senha-bem-comprida');
    senhaAtual = 'terceira-senha-bem-comprida';

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ revokedSessions: 2 });

    // As duas caem. É o ponto: quem redefine a senha desconfiando de invasão
    // precisa que o invasor caia junto, e aqui não existe "sessão atual" a
    // preservar — quem pediu não estava logado.
    expect((await sessaoAindaVale(primeiroAparelho)).statusCode).toBe(401);
    expect((await sessaoAindaVale(segundoAparelho)).statusCode).toBe(401);
  }, 60_000);
});

describe('rate limit do forgot-password', () => {
  it('corta o e-mail que pede demais, com o código estável do contrato', async () => {
    const { limite } = LIMITES.forgot_password.identifier;

    for (let i = 0; i < limite; i += 1) {
      const resposta = await pedirRecuperacao(contaDoLimite.email, IP_DO_LIMITE);
      expect(resposta.statusCode).toBe(202);
    }

    const excedente = await pedirRecuperacao(contaDoLimite.email, IP_DO_LIMITE);

    expect(excedente.statusCode).toBe(429);
    expect(excedente.json()).toMatchObject({
      code: 'RATE_LIMITED',
      details: { rateLimit: ['LIMITE_POR_IDENTIFICADOR'] },
    });
    expect(excedente.headers['retry-after']).toBeDefined();

    // E o corte vale para o e-mail, não para a máquina: outro endereço, do
    // mesmo IP, ainda passa — o teto por IP é maior que o teto por conta
    // neste escopo, de propósito (ver `limite-de-tentativas.ts`).
    const outroEmail = await pedirRecuperacao(EMAIL_SEM_CONTA, IP_DO_LIMITE);
    expect(outroEmail.statusCode).toBe(202);
  }, 60_000);

  it('conta a requisição exista a conta ou não', async () => {
    // Se o contador só subisse quando há conta, o próprio
    // `ratelimit-remaining` viraria o oráculo que o resto do fluxo evita:
    // bastaria comparar o cabeçalho de dois e-mails.
    const semConta = await pedirRecuperacao(EMAIL_SEM_CONTA, IP_DO_LIMITE);
    const comConta = await pedirRecuperacao(contaDoLimite.email, IP_DO_LIMITE);

    expect(semConta.headers['ratelimit-remaining']).toBe(comConta.headers['ratelimit-remaining']);
  });
});
