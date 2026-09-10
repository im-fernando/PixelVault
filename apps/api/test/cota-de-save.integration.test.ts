import { createHash, randomBytes } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import { COTA_DE_SAVE_NA_NUVEM_EM_BYTES, type SramUploadResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A cota de save na nuvem da #93, contra PostgreSQL e MinIO de verdade.
 *
 * O uso já acumulado é montado escrevendo em `user_saves` direto — como
 * `cota-de-armazenamento.integration.test.ts` faz para `user_roms`: chegar
 * aos 32 MiB pelo fluxo de upload de verdade exigiria mais de cem gravações
 * de SRAM no teto de 256 KiB, e o que a cota olha é a soma da tabela, não o
 * caminho por onde ela foi parar lá. O que passa pelo fluxo de verdade
 * (`POST /api/progress/sram/:romId`) é a gravação que está sob teste em cada
 * `it` — é ela que prova a recusa, ou a permissão.
 *
 * Toda linha seguida de `userId, sha256` seguido de `kind: 'sram'` respeita a
 * FK composta de `user_saves` para `user_roms`: uma `UserRom` própria (real
 * ou seedada) precisa existir antes de qualquer `UserSave` apontar para ela.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.93';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const contaLivre = rastro.identidadeNova('cota-save-livre');
const contaCheia = rastro.identidadeNova('cota-save-cheia');
const contaNoTeto = rastro.identidadeNova('cota-save-teto');

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

/** `storage_key` de tudo que este arquivo gravou de verdade, para apagar no fim. */
const chavesDeStorage = new Set<string>();

let app: FastifyInstance;
let livreId: string;
let cheiaId: string;
let noTetoId: string;
let romDaContaLivre: string;
let romProprioDoNoTeto: string;

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

/**
 * Uma `UserRom` que existe só no banco — mesma mecânica de
 * `cota-de-armazenamento.integration.test.ts`, para o `UserSave` seedado a
 * seguir ter para onde apontar a FK composta.
 */
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

/** Um `UserSave` que existe só no banco, sem objeto real no storage. */
async function seedarSave(userId: string, sha256: string, sizeBytes: number): Promise<void> {
  await prisma.userSave.create({
    data: { userId, sha256, kind: 'sram', storageKey: `saves/seed/${sha256}`, sizeBytes },
  });
}

function base64De(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function gravar(cookie: string, romId: string, revision: number, bytes: Uint8Array) {
  return app.inject({
    method: 'POST',
    url: `/api/progress/sram/${romId}`,
    payload: { revision, dataBase64: base64De(bytes) },
    ...comCookie(cookie),
  });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  livreId = await criarConta(criador, contaLivre);
  cheiaId = await criarConta(criador, contaCheia);
  noTetoId = await criarConta(criador, contaNoTeto);
  await criador.close();

  app = await buildApp(configDeTeste);
  romDaContaLivre = await enviarRom(
    await logar(contaLivre),
    livreId,
    romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }),
  );
  romProprioDoNoTeto = await enviarRom(
    await logar(contaNoTeto),
    noTetoId,
    romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }),
  );
  await app.close();

  // contaCheia: uma ROM (seedada) com um save exatamente no teto, e uma
  // segunda ROM sem save nenhum — é nesta segunda que os testes tentam
  // gravar.
  const shaSeedado = await seedarRom(cheiaId, 'cheia-existente');
  await seedarSave(cheiaId, shaSeedado, COTA_DE_SAVE_NA_NUVEM_EM_BYTES);
  await seedarRom(cheiaId, 'cheia-sem-save');

  // contaNoTeto: uma ROM seedada cujo save ocupa o resto da cota, deixando
  // exatamente 100 KiB livres para o save próprio da ROM enviada de verdade.
  const shaOutraDoNoTeto = await seedarRom(noTetoId, 'no-teto-outra');
  await seedarSave(noTetoId, shaOutraDoNoTeto, COTA_DE_SAVE_NA_NUVEM_EM_BYTES - 100 * 1024);
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

describe('POST /api/progress/sram/:romId, contra a cota de save na nuvem', () => {
  it('grava normalmente quem tem espaço de sobra', async () => {
    const cookie = await logar(contaLivre);

    const resposta = await gravar(cookie, romDaContaLivre, 0, new Uint8Array(64).fill(0x9));

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<SramUploadResponse>().status).toBe('gravado');
  });

  it('recusa quem estouraria a cota, sem gravar nada e sem tocar o storage', async () => {
    const cookie = await logar(contaCheia);
    const semSave = await prisma.userRom.findFirstOrThrow({
      where: { userId: cheiaId, fileName: 'seed-cheia-sem-save.sfc' },
    });

    const resposta = await gravar(cookie, semSave.id, 0, new Uint8Array(1).fill(0x1));

    expect(resposta.statusCode).toBe(409);
    const corpo = resposta.json<Record<string, unknown>>();
    expect(corpo).toMatchObject({ code: 'CONFLICT', details: { cota: ['LIMITE_DE_BYTES'] } });
    expect(String(corpo['message'])).toMatch(/32 MiB/);

    // Nenhuma linha nova: a recusa aconteceu antes de qualquer escrita.
    expect(
      await prisma.userSave.findUnique({
        where: { userId_sha256_kind: { userId: cheiaId, sha256: semSave.sha256, kind: 'sram' } },
      }),
    ).toBeNull();
  }, 30_000);

  it('regravar o próprio save no teto não soma em dobro, e o que passa disso recusa', async () => {
    const cookie = await logar(contaNoTeto);
    const cemKib = 100 * 1024;

    // A conta tem exatamente 100 KiB livres (ver o seed em beforeAll). A
    // primeira gravação do save próprio preenche exatamente esse espaço — a
    // soma da conta fecha a cota.
    const primeira = await gravar(cookie, romProprioDoNoTeto, 0, new Uint8Array(cemKib).fill(0x1));
    expect(primeira.statusCode).toBe(200);
    expect(primeira.json<SramUploadResponse>().revision).toBe(1);

    // Regravar o mesmo save, do mesmo tamanho: a soma não muda, porque o save
    // antigo sai da conta antes do novo entrar. Isto não pode dar 409 — é
    // exatamente o caso que uma cota ingênua (sem descontar o antigo) erraria.
    const regravar = await gravar(cookie, romProprioDoNoTeto, 1, new Uint8Array(cemKib).fill(0x2));
    expect(regravar.statusCode).toBe(200);
    expect(regravar.json<SramUploadResponse>().revision).toBe(2);

    // Um byte a mais que o que ele substitui já não cabe.
    const maiorQueOAnterior = await gravar(
      cookie,
      romProprioDoNoTeto,
      2,
      new Uint8Array(cemKib + 1).fill(0x3),
    );
    expect(maiorQueOAnterior.statusCode).toBe(409);
    expect(maiorQueOAnterior.json<Record<string, unknown>>()).toMatchObject({
      code: 'CONFLICT',
      details: { cota: ['LIMITE_DE_BYTES'] },
    });

    // A recusa não mexeu na linha: a revisão continua a que a regravação deixou.
    const shaDaRomPropria = (
      await prisma.userRom.findUniqueOrThrow({ where: { id: romProprioDoNoTeto } })
    ).sha256;
    const linha = await prisma.userSave.findUniqueOrThrow({
      where: { userId_sha256_kind: { userId: noTetoId, sha256: shaDaRomPropria, kind: 'sram' } },
    });
    expect(linha.revision).toBe(2);
    expect(linha.sizeBytes).toBe(cemKib);
  }, 30_000);
});
