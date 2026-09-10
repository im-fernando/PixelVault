import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { COTA_DE_SAVE_NA_NUVEM_EM_BYTES, type StateUploadResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A cota de save state da #109 — mesmo teto de SRAM (#93), agora somando
 * também `thumbnailSizeBytes`: o critério de aceite que só esta issue
 * cobre é a conta na cota recusar quando SÓ a miniatura estoura, ainda que o
 * estado sozinho coubesse. Mesma mecânica de seed direto na tabela que
 * `cota-de-save.integration.test.ts` já usa para chegar ao teto sem cem
 * gravações reais.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.94';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const contaLivre = rastro.identidadeNova('st-cota-livre');
const contaMiniaturaEstoura = rastro.identidadeNova('st-cota-mini');

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

/** `storage_key`/`thumbnail_key` de tudo que este arquivo gravou de verdade, para apagar no fim. */
const chavesDeStorage = new Set<string>();

let app: FastifyInstance;
let livreId: string;
let miniaturaEstouraId: string;
let romDaContaLivre: string;

function comCookie(cookie: string) {
  return { remoteAddress: IP_DO_ARQUIVO, cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie } };
}

async function criarConta(criador: FastifyInstance, dados: { email: string; handle: string }) {
  const resposta = await criador.inject({
    method: 'POST',
    url: '/api/auth/register',
    payload: { ...dados, password: SENHA, termsAccepted: true },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(202);

  return (await prisma.user.findUniqueOrThrow({ where: { email: dados.email } })).id;
}

async function logar(identidade: { email: string }): Promise<string> {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: identidade.email, password: SENHA },
    remoteAddress: IP_DO_ARQUIVO,
  });
  expect(resposta.statusCode).toBe(200);

  return resposta.cookies.find((c) => c.name === NOME_DO_COOKIE_DE_SESSAO)?.value ?? '';
}

/** O BYOR inteiro numa chamada — a ROM entra na biblioteca pelo caminho de verdade. */
async function enviarRom(cookie: string, userId: string, conteudo: Uint8Array): Promise<string> {
  const autorizacao = await app.inject({
    method: 'POST',
    url: '/api/library/uploads',
    payload: { sizeBytes: conteudo.length },
    ...comCookie(cookie),
  });
  expect(autorizacao.statusCode).toBe(200);

  const ticket = autorizacao.json<{
    status: string;
    uploadId: string;
    url: string;
    contentType: string;
  }>();
  chavesDeStorage.add(`quarentena/${userId}/${ticket.uploadId}`);

  const enviado = await fetch(ticket.url, {
    method: 'PUT',
    body: conteudo,
    headers: { 'content-type': ticket.contentType },
  });
  expect(enviado.status).toBe(200);

  const concluido = await app.inject({
    method: 'POST',
    url: `/api/library/uploads/${ticket.uploadId}/complete`,
    payload: { fileName: 'jogo.sfc' },
    ...comCookie(cookie),
  });
  expect(concluido.statusCode).toBe(200);

  const corpo = concluido.json<{ romId: string; sha256: string }>();
  chavesDeStorage.add(`roms/${corpo.sha256}`);
  return corpo.romId;
}

/** Uma `UserRom` que existe só no banco — para o `UserSave` seedado ter para onde apontar a FK composta. */
async function seedarRom(userId: string, marcador: string): Promise<string> {
  const sha256 = createHash('sha256').update(marcador).digest('hex');
  await prisma.userRom.create({
    data: {
      userId,
      sha256,
      storageKey: `roms/${sha256}`,
      sizeBytes: 1024,
      fileName: `seed-${marcador}.sfc`,
    },
  });
  return sha256;
}

/** Um `UserSave` de save state que existe só no banco, sem objetos reais no storage. */
async function seedarSaveState(
  userId: string,
  sha256: string,
  sizeBytes: number,
  thumbnailSizeBytes: number,
): Promise<void> {
  await prisma.userSave.create({
    data: {
      userId,
      sha256,
      kind: 'state',
      slot: 0,
      storageKey: `saves/seed/${sha256}`,
      sizeBytes,
      thumbnailKey: `saves/seed/${sha256}-thumb`,
      thumbnailSizeBytes,
    },
  });
}

function base64De(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function gravar(
  cookie: string,
  romId: string,
  slot: number,
  revision: number,
  bytes: Uint8Array,
  thumbnailBytes: Uint8Array,
) {
  return app.inject({
    method: 'POST',
    url: `/api/progress/state/${romId}/${slot}`,
    payload: { revision, dataBase64: base64De(bytes), thumbnailBase64: base64De(thumbnailBytes) },
    ...comCookie(cookie),
  });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  livreId = await criarConta(criador, contaLivre);
  miniaturaEstouraId = await criarConta(criador, contaMiniaturaEstoura);
  await criador.close();

  app = await buildApp(configDeTeste);
  romDaContaLivre = await enviarRom(
    await logar(contaLivre),
    livreId,
    romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }),
  );
  await app.close();

  // contaMiniaturaEstoura: um save state seedado cujo ESTADO é minúsculo mas
  // a MINIATURA sozinha já ocupa o teto inteiro — é o cenário que prova que
  // a checagem soma os dois objetos, não só `sizeBytes`. Uma segunda ROM,
  // sem save nenhum, é onde o teste tenta gravar.
  const shaSeedado = await seedarRom(miniaturaEstouraId, 'miniatura-existente');
  await seedarSaveState(miniaturaEstouraId, shaSeedado, 1024, COTA_DE_SAVE_NA_NUVEM_EM_BYTES);
  await seedarRom(miniaturaEstouraId, 'miniatura-sem-save');
}, 60_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await Promise.all([...chavesDeStorage].map((chave) => armazenamento.apagar(chave)));
  await rastro.limpar();
});

describe('POST /api/progress/state/:romId/:slot, contra a cota de save na nuvem', () => {
  it('grava normalmente quem tem espaço de sobra', async () => {
    const cookie = await logar(contaLivre);

    const resposta = await gravar(
      cookie,
      romDaContaLivre,
      0,
      0,
      new Uint8Array(256).fill(0x9),
      new Uint8Array(16).fill(0x9),
    );

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<StateUploadResponse>().status).toBe('gravado');
  });

  it('recusa quando só a miniatura estoura a cota, mesmo com o estado cabendo de sobra', async () => {
    const cookie = await logar(contaMiniaturaEstoura);
    // O ID de rom seedado já é o `sha256`; a rota espera o `romId` da linha
    // de `user_roms` — busca a linha para pegar o `id` de verdade.
    const romAlvo = await prisma.userRom.findFirstOrThrow({
      where: { userId: miniaturaEstouraId, fileName: 'seed-miniatura-sem-save.sfc' },
    });

    const resposta = await gravar(
      cookie,
      romAlvo.id,
      0,
      0,
      new Uint8Array(1).fill(0x1),
      new Uint8Array(1).fill(0x1),
    );

    expect(resposta.statusCode).toBe(409);
    const corpo = resposta.json<Record<string, unknown>>();
    expect(corpo).toMatchObject({ code: 'CONFLICT', details: { cota: ['LIMITE_DE_BYTES'] } });

    // Nenhuma linha nova: a recusa aconteceu antes de qualquer escrita.
    expect(
      await prisma.userSave.findUnique({
        where: {
          userId_sha256_kind_slot: {
            userId: miniaturaEstouraId,
            sha256: romAlvo.sha256,
            kind: 'state',
            slot: 0,
          },
        },
      }),
    ).toBeNull();
  }, 30_000);
});
