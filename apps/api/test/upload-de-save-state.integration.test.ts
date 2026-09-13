import { createHash, randomBytes } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { RomUploadResponse, StateUploadResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A gravação de save state da #105, contra PostgreSQL e MinIO de verdade —
 * mesmo critério de aceite da SRAM (#89), agora por slot e com miniatura
 * obrigatória: primeira gravação de um slot cria com `revision: 1`;
 * gravação com a revisão certa incrementa; gravação com revisão
 * desatualizada recusa com 409 (incluindo a miniatura da nuvem nos
 * detalhes) e não grava nada; dois slots da mesma ROM não colidem.
 *
 * Como no resto da suíte, o bucket é o de desenvolvimento (docs/adr/0022):
 * este arquivo apaga exatamente o que criou.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.71';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dono = rastro.identidadeNova('state');
const intruso = rastro.identidadeNova('state-alheio');
let donoId: string;

const ROM = romDeSnes({ marcador: new Uint8Array(randomBytes(32)) });
const NOME_DO_ARQUIVO = 'jogo-do-save-state.sfc';

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

/** `user_saves.storage_key`/`thumbnail_key` de tudo que este arquivo gravou, para apagar no fim. */
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
  cookie: string | undefined,
  romIdAlvo: string,
  slot: number,
  revision: number,
  bytes: Uint8Array,
  thumbnailBytes: Uint8Array = bytesDaMiniatura(0xff),
): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: `/api/progress/state/${romIdAlvo}/${slot}`,
    payload: {
      revision,
      dataBase64: base64De(bytes),
      thumbnailBase64: base64De(thumbnailBytes),
    },
    ...comCookie(cookie),
  });
}

function shaDaRom(): string {
  return createHash('sha256').update(ROM).digest('hex');
}

/**
 * Registra as chaves gravadas para a limpeza do fim e apaga as linhas dos
 * quatro slots — cada `it` deste arquivo começa "sem save state ainda" em
 * qualquer slot, mesma premissa de `revision: 0` que a suíte de SRAM usa.
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

describe('POST /api/progress/state/:romId/:slot', () => {
  it('a primeira gravação de um slot cria a linha com revision: 1', async () => {
    const cookie = await logar(dono);

    const resposta = await gravar(cookie, romId, 0, 0, bytesDoEstado(0x01));

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<StateUploadResponse>();
    expect(corpo.status).toBe('gravado');
    expect(corpo.revision).toBe(1);
    expect(corpo.sizeBytes).toBe(256);
  });

  it('gravação subsequente com a revisão certa incrementa', async () => {
    const cookie = await logar(dono);

    const primeira = (
      await gravar(cookie, romId, 1, 0, bytesDoEstado(0x02))
    ).json<StateUploadResponse>();
    expect(primeira.revision).toBe(1);

    const resposta = await gravar(cookie, romId, 1, 1, bytesDoEstado(0x03));

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<StateUploadResponse>();
    expect(corpo.revision).toBe(2);
  });

  it('gravação com revisão desatualizada recebe 409 com a miniatura da nuvem, e não grava nada', async () => {
    const cookie = await logar(dono);

    const primeira = (
      await gravar(cookie, romId, 2, 0, bytesDoEstado(0x04), bytesDaMiniatura(0xaa))
    ).json<StateUploadResponse>();
    expect(primeira.revision).toBe(1);
    // Um segundo dispositivo grava por cima, sem que este saiba.
    const segunda = (
      await gravar(cookie, romId, 2, 1, bytesDoEstado(0x05), bytesDaMiniatura(0xbb))
    ).json<StateUploadResponse>();
    expect(segunda.revision).toBe(2);

    // Este continua achando que a revisão vigente é a 1.
    const resposta = await gravar(cookie, romId, 2, 1, bytesDoEstado(0x06));

    expect(resposta.statusCode).toBe(409);
    const corpo = resposta.json<{ code: string; details?: Record<string, string[]> }>();
    expect(corpo.code).toBe('CONFLICT');
    expect(corpo.details?.['revision']).toEqual(['2']);
    expect(corpo.details?.['sizeBytes']).toEqual(['256']);
    expect(corpo.details?.['updatedAt']?.[0]).toBeDefined();
    expect(corpo.details?.['thumbnailBase64']?.[0]).toEqual(base64De(bytesDaMiniatura(0xbb)));

    // Nada mudou: a revisão vigente continua a 2, com os bytes da segunda gravação.
    const linha = await prisma.userSave.findUniqueOrThrow({
      where: {
        userId_sha256_kind_slot: {
          userId: donoId,
          sha256: shaDaRom(),
          kind: 'state',
          slot: 2,
        },
      },
    });
    expect(linha.revision).toBe(2);
  });

  it('aceita o teto de 4 MiB mesmo quando o JSON em base64 ultrapassa 1 MiB', async () => {
    const cookie = await logar(dono);
    const bytes = new Uint8Array(4 * 1024 * 1024).fill(0x42);
    const resposta = await gravar(cookie, romId, 0, 0, bytes);
    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<StateUploadResponse>().sizeBytes).toBe(bytes.length);
  });

  it('dois slots da mesma ROM não colidem entre si', async () => {
    const cookie = await logar(dono);

    const slotA = (
      await gravar(cookie, romId, 0, 0, bytesDoEstado(0x10))
    ).json<StateUploadResponse>();
    const slotB = (
      await gravar(cookie, romId, 1, 0, bytesDoEstado(0x20))
    ).json<StateUploadResponse>();

    expect(slotA.revision).toBe(1);
    expect(slotB.revision).toBe(1);

    // Regravar o slot 0 não afeta a revisão do slot 1.
    const slotADeNovo = (
      await gravar(cookie, romId, 0, 1, bytesDoEstado(0x11))
    ).json<StateUploadResponse>();
    expect(slotADeNovo.revision).toBe(2);

    const linhaSlotB = await prisma.userSave.findUniqueOrThrow({
      where: {
        userId_sha256_kind_slot: { userId: donoId, sha256: shaDaRom(), kind: 'state', slot: 1 },
      },
    });
    expect(linhaSlotB.revision).toBe(1);
  });

  it('romId de outra conta responde o mesmo 404 de um romId que nunca existiu', async () => {
    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '11111111-1111-4111-8111-111111111111';

    const respostaAlheia = await gravar(cookieDoIntruso, romId, 0, 0, bytesDoEstado(0x07));
    const respostaInexistente = await gravar(
      cookieDoIntruso,
      idInexistente,
      0,
      0,
      bytesDoEstado(0x07),
    );

    expect(respostaAlheia.statusCode).toBe(404);
    expect(respostaInexistente.statusCode).toBe(404);

    const semRastro = (r: RespostaInjetada): unknown => {
      const corpo = r.json<Record<string, unknown>>();
      delete corpo['requestId'];
      return corpo;
    };
    expect(semRastro(respostaAlheia)).toEqual(semRastro(respostaInexistente));
  });
});
