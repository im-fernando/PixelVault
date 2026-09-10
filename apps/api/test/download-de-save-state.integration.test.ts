import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type {
  RomUploadResponse,
  StateDownloadResponse,
  StateListResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * O lado de leitura da #105, contra PostgreSQL e MinIO de verdade — issue
 * #106: listar os até 4 slots de uma ROM com miniatura embutida; baixar um
 * slot específico por URL assinada; o mesmo 404 uniforme da SRAM para
 * `romId` alheio ou inexistente, na listagem e no download.
 *
 * Como no resto da suíte, o bucket é o de desenvolvimento (docs/adr/0022):
 * este arquivo apaga exatamente o que criou.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.106';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dono = rastro.identidadeNova('state-r');
const intruso = rastro.identidadeNova('state-r-alheio');
let donoId: string;

const ROM = romDeSnes({ marcador: new Uint8Array(randomBytes(32)) });
const NOME_DO_ARQUIVO = 'jogo-do-save-state-leitura.sfc';

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

function bytesDoEstado(marcador: number): Uint8Array {
  const bytes = new Uint8Array(256);
  bytes.fill(marcador);
  return bytes;
}

function bytesDaMiniatura(marcador: number): Uint8Array {
  const bytes = new Uint8Array(16);
  bytes.fill(marcador);
  return bytes;
}

function base64De(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function gravar(
  cookie: string,
  slot: number,
  revision: number,
  bytes: Uint8Array,
  thumbnailBytes: Uint8Array,
): Promise<void> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/api/progress/state/${romId}/${slot}`,
    payload: { revision, dataBase64: base64De(bytes), thumbnailBase64: base64De(thumbnailBytes) },
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
}

async function listar(cookie: string | undefined, romIdAlvo: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: `/api/progress/state/${romIdAlvo}`,
    ...comCookie(cookie),
  });
}

async function ler(
  cookie: string | undefined,
  romIdAlvo: string,
  slot: number,
): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: `/api/progress/state/${romIdAlvo}/${slot}`,
    ...comCookie(cookie),
  });
}

async function baixar(url: string): Promise<Uint8Array> {
  const resposta = await fetch(url);
  expect(resposta.status).toBe(200);
  return new Uint8Array(await resposta.arrayBuffer());
}

function shaDaRom(): string {
  return createHash('sha256').update(ROM).digest('hex');
}

/**
 * Mesmo raciocínio de `upload-de-save-state.integration.test.ts`: cada `it`
 * começa "sem save state em slot nenhum", para o array vazio da listagem e
 * o `sem-save` do download não vazarem de um teste para o outro.
 */
async function limparSavesDoTeste(): Promise<void> {
  const sha256 = shaDaRom();
  const linhas = await prisma.userSave.findMany({
    where: { userId: donoId, sha256, kind: 'state' },
    select: { storageKey: true, thumbnailKey: true },
  });
  for (const linha of linhas) {
    chavesDeSave.add(linha.storageKey);
    if (linha.thumbnailKey !== null) chavesDeSave.add(linha.thumbnailKey);
  }

  await prisma.userSave.deleteMany({ where: { userId: donoId, sha256, kind: 'state' } });
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
  await limparSavesDoTeste();
  return async () => {
    await app.close();
  };
});

afterEach(async () => {
  await limparSavesDoTeste();
});

afterAll(async () => {
  await Promise.all([...chavesDeSave, ...objetosDeRom].map((chave) => armazenamento.apagar(chave)));
  await rastro.limpar();
});

describe('GET /api/progress/state/:romId', () => {
  it('ROM sem save state em slot nenhum responde um array vazio, não erro', async () => {
    const cookie = await logar(dono);

    const resposta = await listar(cookie, romId);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<StateListResponse>()).toEqual({ slots: [] });
  });

  it('lista o slot gravado com a miniatura certa, e só ele', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 1, 0, bytesDoEstado(0x21), bytesDaMiniatura(0xa1));

    const resposta = await listar(cookie, romId);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<StateListResponse>();
    expect(corpo.slots).toHaveLength(1);
    expect(corpo.slots[0]).toMatchObject({ slot: 1, revision: 1, sizeBytes: 256 });
    expect(Buffer.from(corpo.slots[0]!.thumbnailBase64, 'base64')).toEqual(
      Buffer.from(bytesDaMiniatura(0xa1)),
    );
  });

  it('dois slots da mesma ROM não colidem — cada um aparece com o próprio conteúdo', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 0, 0, bytesDoEstado(0x30), bytesDaMiniatura(0xb0));
    await gravar(cookie, 2, 0, bytesDoEstado(0x32), bytesDaMiniatura(0xb2));

    const resposta = await listar(cookie, romId);

    const corpo = resposta.json<StateListResponse>();
    expect(corpo.slots.map((s) => s.slot).sort()).toEqual([0, 2]);
    const slot0 = corpo.slots.find((s) => s.slot === 0)!;
    const slot2 = corpo.slots.find((s) => s.slot === 2)!;
    expect(Buffer.from(slot0.thumbnailBase64, 'base64')).toEqual(
      Buffer.from(bytesDaMiniatura(0xb0)),
    );
    expect(Buffer.from(slot2.thumbnailBase64, 'base64')).toEqual(
      Buffer.from(bytesDaMiniatura(0xb2)),
    );
  });

  it('romId de outra conta responde o mesmo 404 de um romId que nunca existiu', async () => {
    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '44444444-4444-4444-8444-444444444444';

    const respostaAlheia = await listar(cookieDoIntruso, romId);
    const respostaInexistente = await listar(cookieDoIntruso, idInexistente);

    expect(respostaAlheia.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });
});

describe('GET /api/progress/state/:romId/:slot', () => {
  it('slot sem save state responde sem-save, não erro', async () => {
    const cookie = await logar(dono);

    const resposta = await ler(cookie, romId, 3);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<StateDownloadResponse>()).toEqual({ status: 'sem-save' });
  });

  it('o dono baixa o save state certo do slot, com a revisão certa', async () => {
    const cookie = await logar(dono);
    const bytes = bytesDoEstado(0x41);
    await gravar(cookie, 1, 0, bytes, bytesDaMiniatura(0xc1));

    const resposta = await ler(cookie, romId, 1);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<StateDownloadResponse>();
    if (corpo.status !== 'encontrado') {
      throw new Error(`esperava "encontrado", veio ${corpo.status}`);
    }
    expect(corpo.revision).toBe(1);
    expect(corpo.sizeBytes).toBe(bytes.length);

    // O critério de aceite: a URL assinada tem que abrir exatamente os bytes
    // daquele slot, não os de outro slot ou de outra gravação.
    expect(await baixar(corpo.url)).toEqual(bytes);
  });

  it('um slot vazio e outro gravado da mesma ROM não se confundem no download', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 0, 0, bytesDoEstado(0x50), bytesDaMiniatura(0xd0));

    const slotGravado = await ler(cookie, romId, 0);
    const slotVazio = await ler(cookie, romId, 2);

    const corpoGravado = slotGravado.json<StateDownloadResponse>();
    expect(corpoGravado.status).toBe('encontrado');
    expect(slotVazio.json<StateDownloadResponse>()).toEqual({ status: 'sem-save' });
  });

  it('romId de outra conta responde o mesmo 404 de um romId que nunca existiu', async () => {
    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '55555555-5555-4555-8555-555555555555';

    const respostaAlheia = await ler(cookieDoIntruso, romId, 0);
    const respostaInexistente = await ler(cookieDoIntruso, idInexistente, 0);

    expect(respostaAlheia.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });

  it('romId alheio com save recebe o mesmo 404, sem vazar que o save existe', async () => {
    const cookie = await logar(dono);
    await gravar(cookie, 0, 0, bytesDoEstado(0x60), bytesDaMiniatura(0xe0));

    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '66666666-6666-4666-8666-666666666666';

    const respostaAlheia = await ler(cookieDoIntruso, romId, 0);
    const respostaInexistente = await ler(cookieDoIntruso, idInexistente, 0);

    expect(respostaAlheia.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });
});
