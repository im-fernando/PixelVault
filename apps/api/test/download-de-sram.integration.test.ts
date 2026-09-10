import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type {
  RomUploadResponse,
  SramDownloadResponse,
  SramUploadResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A leitura de SRAM da #90, contra PostgreSQL e MinIO de verdade — o
 * critério de aceite da issue: o dono baixa a SRAM certa com a revisão
 * certa; outra conta pedindo o mesmo `romId` recebe o mesmo 404 de um
 * `romId` que nunca existiu; ROM sem save ainda responde `sem-save`, não
 * erro.
 *
 * Como no resto da suíte, o bucket é o de desenvolvimento (docs/adr/0022):
 * este arquivo apaga exatamente o que criou.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.71';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dono = rastro.identidadeNova('sram-r');
const intruso = rastro.identidadeNova('sram-r-alheio');
let donoId: string;

const ROM = romDeSnes({ marcador: new Uint8Array(randomBytes(32)) });
const NOME_DO_ARQUIVO = 'jogo-do-save-leitura.sfc';

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

const chavesDeSave = new Set<string>();
const objetosDeRom: string[] = [];

let app: FastifyInstance;
let romId: string;

type RespostaInjetada = Awaited<ReturnType<FastifyInstance['inject']>>;

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

/** O BYOR inteiro numa chamada — a ROM entra na biblioteca pelo caminho de verdade. */
async function enviarRom(cookie: string, conteudo: Uint8Array, fileName: string): Promise<string> {
  const autorizacao = await app.inject({
    method: 'POST',
    url: '/api/library/uploads',
    payload: { sizeBytes: conteudo.length },
    ...comCookie(cookie),
  });
  expect(autorizacao.statusCode).toBe(200);

  const ticket = autorizacao.json<RomUploadResponse>();
  if (ticket.status !== 'envio-autorizado') {
    throw new Error(`esperava uma autorização de envio, veio ${ticket.status}`);
  }
  objetosDeRom.push(`quarentena/${donoId}/${ticket.uploadId}`);

  const enviado = await fetch(ticket.url, {
    method: 'PUT',
    body: conteudo,
    headers: { 'content-type': ticket.contentType },
  });
  expect(enviado.status).toBe(200);

  const concluido = await app.inject({
    method: 'POST',
    url: `/api/library/uploads/${ticket.uploadId}/complete`,
    payload: { fileName },
    ...comCookie(cookie),
  });
  expect(concluido.statusCode).toBe(200);

  const corpo = concluido.json<{ romId: string; sha256: string }>();
  objetosDeRom.push(`roms/${corpo.sha256}`);
  return corpo.romId;
}

function bytesDeSram(marcador: number): Uint8Array {
  const bytes = new Uint8Array(64);
  bytes.fill(marcador);
  return bytes;
}

function base64De(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function gravar(
  cookie: string,
  revision: number,
  bytes: Uint8Array,
): Promise<SramUploadResponse> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/api/progress/sram/${romId}`,
    payload: { revision, dataBase64: base64De(bytes) },
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<SramUploadResponse>();
}

async function ler(cookie: string | undefined, romIdAlvo: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: `/api/progress/sram/${romIdAlvo}`,
    ...comCookie(cookie),
  });
}

function shaDaRom(): string {
  return createHash('sha256').update(ROM).digest('hex');
}

/**
 * Mesmo raciocínio de `upload-de-sram.integration.test.ts`: cada `it` começa
 * "sem save na nuvem ainda", para o `sem-save` de um teste não vazar de um
 * pro outro.
 */
async function limparSaveDoTeste(): Promise<void> {
  const sha256 = shaDaRom();
  const linha = await prisma.userSave.findUnique({
    where: { userId_sha256_kind: { userId: donoId, sha256, kind: 'sram' } },
    select: { storageKey: true },
  });
  if (linha !== null) chavesDeSave.add(linha.storageKey);

  await prisma.userSave.deleteMany({ where: { userId: donoId, sha256 } });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, dono);
  await criarConta(criador, intruso);
  await criador.close();

  donoId = (await prisma.user.findUniqueOrThrow({ where: { email: dono.email } })).id;

  app = await buildApp(configDeTeste);
  romId = await enviarRom(await logar(dono), ROM, NOME_DO_ARQUIVO);
  await app.close();
}, 60_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  await limparSaveDoTeste();
  return async () => {
    await app.close();
  };
});

afterEach(async () => {
  await limparSaveDoTeste();
});

afterAll(async () => {
  await Promise.all([...chavesDeSave, ...objetosDeRom].map((chave) => armazenamento.apagar(chave)));
  await rastro.limpar();
});

describe('GET /api/progress/sram/:romId', () => {
  it('ROM sem save na nuvem ainda responde sem-save, não erro', async () => {
    const cookie = await logar(dono);

    const resposta = await ler(cookie, romId);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<SramDownloadResponse>()).toEqual({ status: 'sem-save' });
  });

  it('o dono baixa a SRAM certa com a revisão certa', async () => {
    const cookie = await logar(dono);
    const bytes = bytesDeSram(0x11);
    const gravado = await gravar(cookie, 0, bytes);

    const resposta = await ler(cookie, romId);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<SramDownloadResponse>();
    if (corpo.status !== 'encontrado') {
      throw new Error(`esperava "encontrado", veio ${corpo.status}`);
    }
    expect(corpo.revision).toBe(gravado.revision);
    expect(corpo.sizeBytes).toBe(bytes.length);
    expect(corpo.updatedAt).toBe(gravado.updatedAt);
    expect(Buffer.from(corpo.dataBase64, 'base64')).toEqual(Buffer.from(bytes));
  });

  it('a leitura devolve a revisão vigente depois de uma segunda gravação', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 0, bytesDeSram(0x12));
    const segunda = await gravar(cookie, 1, bytesDeSram(0x13));

    const resposta = await ler(cookie, romId);

    const corpo = resposta.json<SramDownloadResponse>();
    if (corpo.status !== 'encontrado') {
      throw new Error(`esperava "encontrado", veio ${corpo.status}`);
    }
    expect(corpo.revision).toBe(segunda.revision);
    expect(Buffer.from(corpo.dataBase64, 'base64')).toEqual(Buffer.from(bytesDeSram(0x13)));
  });

  it('romId de outra conta responde o mesmo 404 de um romId que nunca existiu', async () => {
    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '22222222-2222-4222-8222-222222222222';

    const respostaAlheia = await ler(cookieDoIntruso, romId);
    const respostaInexistente = await ler(cookieDoIntruso, idInexistente);

    expect(respostaAlheia.statusCode).toBe(404);
    expect(respostaInexistente.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });

  it('romId alheio com save recebe o mesmo 404, sem vazar que o save existe', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 0, bytesDeSram(0x14));

    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '33333333-3333-4333-8333-333333333333';

    const respostaAlheia = await ler(cookieDoIntruso, romId);
    const respostaInexistente = await ler(cookieDoIntruso, idInexistente);

    expect(respostaAlheia.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });
});
