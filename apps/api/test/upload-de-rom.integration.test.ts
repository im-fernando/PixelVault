import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import {
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
  TIPO_DE_CONTEUDO_DA_ROM,
  type RomUploadResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * O upload de ROM da #71, contra PostgreSQL e MinIO de verdade.
 *
 * Sem dublê, e não por gosto: o que está sob teste é justamente o que um mock
 * inventaria — que a URL assinada pela API seja aceita por quem recebe, que o
 * `Content-Type` e o tamanho negociados prendam o envio, e que o objeto
 * apareça no bucket sob `quarentena/<userId>/<uuid>`. Um armazenamento falso
 * responderia o que o autor dele achasse.
 *
 * O bucket é o de desenvolvimento, compartilhado com quem está trabalhando na
 * máquina, então vale a disciplina de sempre (docs/adr/0022): este arquivo
 * apaga exatamente os objetos que criou, sem listar o bucket.
 */
const SENHA = 'cavalo-bateria-grampo';

/** Todo request deste arquivo sai deste IP. Ver o cabeçalho de sessoes.integration.test.ts. */
const IP_DO_ARQUIVO = '198.51.100.50';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const conta = rastro.identidadeNova('upload');
const outraConta = rastro.identidadeNova('upload-alheio');
let contaId: string;
let outraContaId: string;

/** Um arquivo pequeno, mas plausível: o que interessa é o caminho, não os bytes. */
const ROM = new Uint8Array(randomBytes(2048));

const armazenamento = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

/** O que este arquivo escreveu no bucket e precisa apagar no fim. */
const objetosCriados: string[] = [];

let app: FastifyInstance;

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

async function pedirUpload(
  cookie: string | undefined,
  payload: Record<string, unknown>,
): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/library/uploads',
    payload,
    ...comCookie(cookie),
  });
}

async function concluir(cookie: string | undefined, uploadId: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: `/api/library/uploads/${uploadId}/complete`,
    ...comCookie(cookie),
  });
}

/** Pede o upload e devolve a autorização, falhando o teste se veio outra coisa. */
async function autorizacaoDeEnvio(
  cookie: string,
  payload: Record<string, unknown> = { sizeBytes: ROM.length },
): Promise<Extract<RomUploadResponse, { status: 'envio-autorizado' }>> {
  const resposta = await pedirUpload(cookie, payload);
  expect(resposta.statusCode).toBe(200);

  const corpo = resposta.json<RomUploadResponse>();
  if (corpo.status !== 'envio-autorizado') {
    throw new Error(`esperava uma autorização de envio, veio ${corpo.status}`);
  }

  objetosCriados.push(chaveDoEnvio(contaId, corpo.uploadId));
  return corpo;
}

function chaveDoEnvio(userId: string, uploadId: string): string {
  return `quarentena/${userId}/${uploadId}`;
}

async function enviar(url: string, conteudo: Uint8Array, tipo: string): Promise<Response> {
  return fetch(url, { method: 'PUT', body: conteudo, headers: { 'content-type': tipo } });
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

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, conta);
  await criarConta(criador, outraConta);
  await criador.close();

  contaId = (await prisma.user.findUniqueOrThrow({ where: { email: conta.email } })).id;
  outraContaId = (await prisma.user.findUniqueOrThrow({ where: { email: outraConta.email } })).id;
}, 60_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await Promise.all(objetosCriados.map((chave) => armazenamento.apagar(chave)));
  // `user_roms` cai por cascata junto com os usuários.
  await rastro.limpar();
});

describe('POST /api/library/uploads', () => {
  it('assina o PUT para a quarentena de quem pediu, com um id que o servidor sorteou', async () => {
    const cookie = await logar(conta);
    // O corpo carrega um caminho e um id escolhidos pelo cliente, exatamente
    // como faria quem está tentando envenenar `roms/<sha256>` (ADR 0014).
    // Nada disso pode encostar na chave.
    const escolhaDoCliente = {
      sizeBytes: ROM.length,
      uploadId: '11111111-1111-4111-8111-111111111111',
      storageKey: 'roms/0000000000000000000000000000000000000000000000000000000000000000',
      key: '../roms/mario',
    };

    const primeiro = await autorizacaoDeEnvio(cookie, escolhaDoCliente);
    const segundo = await autorizacaoDeEnvio(cookie, escolhaDoCliente);

    const caminho = new URL(primeiro.url).pathname;
    expect(caminho).toContain(chaveDoEnvio(contaId, primeiro.uploadId));
    expect(caminho).not.toContain(escolhaDoCliente.uploadId);
    expect(caminho).not.toContain('roms/0000');
    expect(caminho).not.toContain('mario');
    // Id sorteado, e não derivado de nada: dois pedidos iguais dão caminhos
    // diferentes.
    expect(segundo.uploadId).not.toBe(primeiro.uploadId);

    expect(primeiro.contentType).toBe(TIPO_DE_CONTEUDO_DA_ROM);
    expect(primeiro.sizeBytes).toBe(ROM.length);
    expect(primeiro.expiresInSeconds).toBeGreaterThan(0);
  }, 60_000);

  it('recusa quem não tem sessão, sem assinar nada', async () => {
    const resposta = await pedirUpload(undefined, { sizeBytes: ROM.length });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('recusa arquivo maior que o teto antes de assinar', async () => {
    const cookie = await logar(conta);

    const resposta = await pedirUpload(cookie, {
      sizeBytes: TAMANHO_MAXIMO_DE_ROM_EM_BYTES + 1,
    });

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
    // Nenhuma URL saiu: a recusa é da borda, antes de qualquer assinatura.
    expect(resposta.json<Record<string, unknown>>()['url']).toBeUndefined();
  }, 60_000);

  it('recusa tamanho zerado ou negativo, que não é ROM nenhuma', async () => {
    const cookie = await logar(conta);

    expect((await pedirUpload(cookie, { sizeBytes: 0 })).statusCode).toBe(400);
    expect((await pedirUpload(cookie, { sizeBytes: -1 })).statusCode).toBe(400);
  }, 60_000);

  it('não assina upload novo quando o hash informado já está na biblioteca de quem pediu', async () => {
    const cookie = await logar(conta);
    const sha256 = createHash('sha256').update(randomBytes(32)).digest('hex');
    const jaEnviada = await prisma.userRom.create({
      data: {
        userId: contaId,
        sha256,
        storageKey: `roms/${sha256}`,
        sizeBytes: ROM.length,
        fileName: 'ja-enviada.sfc',
      },
      select: { id: true },
    });

    const resposta = await pedirUpload(cookie, { sizeBytes: ROM.length, sha256 });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({ status: 'ja-na-biblioteca', romId: jaEnviada.id });
  }, 60_000);

  it('o hash na biblioteca de outra pessoa não vale como atalho', async () => {
    // A consulta é restrita a quem pediu, de propósito: responder a partir do
    // acervo inteiro transformaria a rota num oráculo de "esta ROM existe no
    // PixelVault" (ADR 0013).
    const sha256 = createHash('sha256').update(randomBytes(32)).digest('hex');
    await prisma.userRom.create({
      data: {
        userId: outraContaId,
        sha256,
        storageKey: `roms/${sha256}`,
        sizeBytes: ROM.length,
        fileName: 'da-outra-conta.sfc',
      },
      select: { id: true },
    });

    const cookie = await logar(conta);
    const resposta = await pedirUpload(cookie, { sizeBytes: ROM.length, sha256 });

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'envio-autorizado' });
  }, 60_000);
});

describe('a URL assinada, usada de verdade', () => {
  it('aceita o arquivo negociado e recusa qualquer outro', async () => {
    const cookie = await logar(conta);
    const autorizacao = await autorizacaoDeEnvio(cookie);
    const chave = chaveDoEnvio(contaId, autorizacao.uploadId);

    // Tipo diferente do assinado: o storage recusa, e nada é gravado.
    expect((await enviar(autorizacao.url, ROM, 'text/html')).status).toBe(403);
    // Mais bytes do que os negociados: idem. É o que impede uma URL pedida
    // para dois megabytes de despejar dois gigabytes na quarentena.
    expect(
      (await enviar(autorizacao.url, new Uint8Array(ROM.length + 1), TIPO_DE_CONTEUDO_DA_ROM))
        .status,
    ).toBe(403);
    expect(await armazenamento.existe(chave)).toBe(false);

    expect((await enviar(autorizacao.url, ROM, autorizacao.contentType)).status).toBe(200);
    expect(await armazenamento.existe(chave)).toBe(true);
  }, 60_000);
});

describe('POST /api/library/uploads/:uploadId/complete', () => {
  it('confirma o objeto na quarentena e responde que a verificação ainda vem', async () => {
    const cookie = await logar(conta);
    const autorizacao = await autorizacaoDeEnvio(cookie);
    expect((await enviar(autorizacao.url, ROM, autorizacao.contentType)).status).toBe(200);
    const romsAntes = await prisma.userRom.count({ where: { userId: contaId } });

    const resposta = await concluir(cookie, autorizacao.uploadId);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toEqual({
      status: 'recebido-aguardando-verificacao',
      uploadId: autorizacao.uploadId,
    });
    // A ROM ainda não é de ninguém: promover é a #72.
    expect(await prisma.userRom.count({ where: { userId: contaId } })).toBe(romsAntes);
    expect(await armazenamento.existe(chaveDoEnvio(contaId, autorizacao.uploadId))).toBe(true);
  }, 60_000);

  it('responde 404 para envio que nunca chegou', async () => {
    const cookie = await logar(conta);
    const autorizacao = await autorizacaoDeEnvio(cookie);

    // A URL foi assinada, mas o cliente nunca enviou o arquivo — o caso
    // normal do upload abandonado, segundo a própria ADR 0014.
    const resposta = await concluir(cookie, autorizacao.uploadId);

    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ code: 'NOT_FOUND' });
  }, 60_000);

  it('responde o mesmo 404 para o envio de outra pessoa, sem tocá-lo', async () => {
    const dono = await logar(conta);
    const autorizacao = await autorizacaoDeEnvio(dono);
    expect((await enviar(autorizacao.url, ROM, autorizacao.contentType)).status).toBe(200);

    const intruso = await logar(outraConta);
    const resposta = await concluir(intruso, autorizacao.uploadId);

    // Nem 403 nem 404 "diferente": a chave é montada a partir da sessão de
    // quem pergunta, então o envio alheio simplesmente não existe para ele.
    expect(resposta.statusCode).toBe(404);
    expect(resposta.json()).toMatchObject({ code: 'NOT_FOUND' });
    expect(await armazenamento.existe(chaveDoEnvio(contaId, autorizacao.uploadId))).toBe(true);
    expect(await armazenamento.existe(chaveDoEnvio(outraContaId, autorizacao.uploadId))).toBe(
      false,
    );
  }, 60_000);

  it('recusa quem não tem sessão', async () => {
    const resposta = await concluir(undefined, randomUUID());

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });

  it('recusa id que não é uuid, antes de tocar no storage', async () => {
    const cookie = await logar(conta);

    const resposta = await concluir(cookie, 'nao-e-um-uuid');

    expect(resposta.statusCode).toBe(400);
  }, 60_000);
});
