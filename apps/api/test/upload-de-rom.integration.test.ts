import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import {
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
  TIPO_DE_CONTEUDO_DA_ROM,
  type RomUploadCompletedResponse,
  type RomUploadResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { arquivoZip, naoEUmaRom, romDeSnes } from './suporte/roms-de-teste.js';

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
/** O jogo do catálogo que casa com a ROM deste arquivo. */
let jogoId: string;

/**
 * A ROM deste arquivo de teste, em duas formas do mesmo jogo.
 *
 * Os bytes precisam passar pela verificação de verdade (#72) — arquivo
 * aleatório é recusado, e com razão —, e precisam ser diferentes a cada
 * execução: o objeto promovido mora em `roms/<sha256>`, caminho compartilhado
 * no bucket de desenvolvimento, e conteúdo fixo faria duas rodadas
 * simultâneas disputarem o mesmo objeto.
 *
 * As duas formas carregam o mesmo jogo: `ROM_COM_HEADER` é `ROM` com os 512
 * bytes de cabeçalho de copiador na frente. Arquivos diferentes, hashes
 * diferentes, mesmo conteúdo catalogado — é o par que prova o match com e sem
 * cabeçalho.
 */
const MARCADOR = new Uint8Array(randomBytes(32));
const ROM = romDeSnes({ marcador: MARCADOR });
const ROM_COM_HEADER = romDeSnes({ marcador: MARCADOR, comCabecalhoDeCopiador: true });

const SHA_DA_ROM = createHash('sha256').update(ROM).digest('hex');
const SHA_COM_HEADER = createHash('sha256').update(ROM_COM_HEADER).digest('hex');

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

/** Slugs de `games` que a suíte da issue #134 criou — apagados no fim. */
const slugsMd5Criados: string[] = [];

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

async function concluir(
  cookie: string | undefined,
  uploadId: string,
  fileName = 'jogo.sfc',
): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: `/api/library/uploads/${uploadId}/complete`,
    payload: { fileName },
    ...comCookie(cookie),
  });
}

/** Pede o upload e devolve a autorização, falhando o teste se veio outra coisa. */
async function autorizacaoDeEnvio(
  cookie: string,
  payload: Record<string, unknown> = { sizeBytes: ROM.length },
  userId?: string,
): Promise<Extract<RomUploadResponse, { status: 'envio-autorizado' }>> {
  const resposta = await pedirUpload(cookie, payload);
  expect(resposta.statusCode).toBe(200);

  const corpo = resposta.json<RomUploadResponse>();
  if (corpo.status !== 'envio-autorizado') {
    throw new Error(`esperava uma autorização de envio, veio ${corpo.status}`);
  }

  objetosCriados.push(chaveDoEnvio(userId ?? contaId, corpo.uploadId));
  return corpo;
}

/**
 * O fluxo inteiro do BYOR numa chamada: pede a URL, envia para o MinIO e
 * manda verificar. É como o front vai fazer, e é o único jeito de o teste
 * afirmar alguma coisa sobre o objeto que sobra no bucket no fim.
 */
async function enviarEConcluir(
  cookie: string,
  userId: string,
  conteudo: Uint8Array,
  fileName: string,
): Promise<RespostaInjetada> {
  const autorizacao = await autorizacaoDeEnvio(cookie, { sizeBytes: conteudo.length }, userId);
  expect((await enviar(autorizacao.url, conteudo, autorizacao.contentType)).status).toBe(200);

  return concluir(cookie, autorizacao.uploadId, fileName);
}

/** O mesmo, já cobrando que a ROM entrou na biblioteca. */
async function biblioteca(
  cookie: string,
  userId: string,
  conteudo: Uint8Array,
  fileName: string,
): Promise<RomUploadCompletedResponse> {
  const resposta = await enviarEConcluir(cookie, userId, conteudo, fileName);
  expect(resposta.statusCode).toBe(200);

  const corpo = resposta.json<RomUploadCompletedResponse>();
  objetosCriados.push(`roms/${corpo.sha256}`);
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

  // O catálogo conhece o jogo pelo hash **sem** o cabeçalho de copiador, que
  // é como as bases de metadado o catalogam. É o que torna o match com header
  // uma afirmação de verdade, e não uma coincidência de fixture.
  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });
  jogoId = (
    await prisma.game.create({
      data: {
        slug: `zz-teste-upload-${randomUUID().slice(0, 8)}`,
        title: 'Jogo de teste do upload',
        systemId: 'snes',
        roms: { create: { sha256: SHA_DA_ROM, sizeBytes: ROM.length } },
      },
      select: { id: true },
    })
  ).id;
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
  // O jogo sai por último e por id: `game_roms` cai por cascata com ele, e
  // `user_roms` cai por cascata com os usuários.
  //
  // A guarda de `jogoId` não é excesso de zelo: se `beforeAll` lançar antes
  // de atribuí-lo (ex.: uma constraint que falhou), `jogoId` fica
  // `undefined` — e `deleteMany({ where: { id: undefined } })` não é "não
  // apague nada", é "apague `games` inteira", porque o Prisma trata `undefined`
  // como ausência de filtro. Contra o banco de dev compartilhado (docs/adr/0022)
  // isso não é um teste que falha, é uma sessão de outra pessoa perdendo
  // catálogo de verdade — foi exatamente o que aconteceu nesta sessão.
  if (jogoId !== undefined) {
    await prisma.game.deleteMany({ where: { id: jogoId } });
  }
  // `in: []` é seguro mesmo vazio — o Prisma gera `IN ()`, que não casa nada.
  await prisma.game.deleteMany({ where: { slug: { in: slugsMd5Criados } } });
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
  it('verifica, promove para o caminho do conteúdo e casa com o catálogo', async () => {
    const cookie = await logar(conta);

    const corpo = await biblioteca(cookie, contaId, ROM_COM_HEADER, 'jogo (Brasil).sfc');

    // O hash é o do arquivo como ele foi enviado — com os 512 bytes de
    // cabeçalho —, e não o que o cliente informou nem o do conteúdo sem
    // header. Guardar o arquivo como a pessoa mandou é a ADR 0013.
    expect(corpo.sha256).toBe(SHA_COM_HEADER);
    expect(corpo.deduplicado).toBe(false);
    expect(corpo.sizeBytes).toBe(ROM_COM_HEADER.length);
    // ...mas o jogo é reconhecido pelo hash SEM cabeçalho, que é o que o
    // catálogo tem. Sem tentar os dois, metade dos dumps de SNES nunca
    // reconheceria o jogo.
    expect(corpo.gameId).toBe(jogoId);

    expect(await armazenamento.existe(`roms/${SHA_COM_HEADER}`)).toBe(true);
    const linha = await prisma.userRom.findUniqueOrThrow({
      where: { userId_sha256: { userId: contaId, sha256: SHA_COM_HEADER } },
    });
    expect(linha).toMatchObject({
      storageKey: `roms/${SHA_COM_HEADER}`,
      gameId: jogoId,
      sizeBytes: ROM_COM_HEADER.length,
      fileName: 'jogo (Brasil).sfc',
    });
  }, 60_000);

  it('dois usuários com o mesmo arquivo dividem um objeto só', async () => {
    // O critério de aceite da #72, e a economia inteira da ADR 0013: a segunda
    // pessoa não transfere nada e ganha a referência do mesmo objeto.
    await biblioteca(await logar(conta), contaId, ROM_COM_HEADER, 'jogo (Brasil).sfc');

    const outroCookie = await logar(outraConta);

    const corpo = await biblioteca(outroCookie, outraContaId, ROM_COM_HEADER, 'meu-jogo.sfc');

    expect(corpo.deduplicado).toBe(true);
    expect(corpo.sha256).toBe(SHA_COM_HEADER);
    expect(corpo.gameId).toBe(jogoId);

    const linhas = await prisma.userRom.findMany({
      where: { sha256: SHA_COM_HEADER, userId: { in: [contaId, outraContaId] } },
      select: { userId: true, storageKey: true, gameId: true },
      orderBy: { uploadedAt: 'asc' },
    });
    expect(linhas).toHaveLength(2);
    expect(new Set(linhas.map((l) => l.userId))).toEqual(new Set([contaId, outraContaId]));
    // Duas referências, um objeto — é literalmente o mesmo `storage_key`.
    expect(new Set(linhas.map((l) => l.storageKey))).toEqual(new Set([`roms/${SHA_COM_HEADER}`]));
    expect(new Set(linhas.map((l) => l.gameId))).toEqual(new Set([jogoId]));
    expect(await armazenamento.existe(`roms/${SHA_COM_HEADER}`)).toBe(true);
  }, 60_000);

  it('o mesmo jogo sem cabeçalho de copiador é outro objeto, e o mesmo jogo', async () => {
    // Arquivo diferente, hash diferente, objeto diferente: o servidor não
    // normaliza nada (ADR 0013). O que amarra os dois é o catálogo.
    const cookie = await logar(conta);

    const corpo = await biblioteca(cookie, contaId, ROM, 'jogo-sem-header.sfc');

    expect(corpo.sha256).toBe(SHA_DA_ROM);
    expect(corpo.sha256).not.toBe(SHA_COM_HEADER);
    expect(corpo.gameId).toBe(jogoId);
    expect(await armazenamento.existe(`roms/${SHA_DA_ROM}`)).toBe(true);
    expect(await armazenamento.existe(`roms/${SHA_COM_HEADER}`)).toBe(true);
  }, 60_000);

  it('enviar de novo o que já se tem devolve a mesma linha, sem duplicar', async () => {
    const cookie = await logar(conta);
    const antes = await prisma.userRom.findUniqueOrThrow({
      where: { userId_sha256: { userId: contaId, sha256: SHA_COM_HEADER } },
      select: { id: true, fileName: true },
    });

    const corpo = await biblioteca(cookie, contaId, ROM_COM_HEADER, 'nome-novo.sfc');

    expect(corpo.romId).toBe(antes.id);
    expect(corpo.deduplicado).toBe(true);
    // O nome guardado é o do primeiro envio: retentativa não sobrescreve o
    // que já estava bom.
    const depois = await prisma.userRom.findUniqueOrThrow({
      where: { userId_sha256: { userId: contaId, sha256: SHA_COM_HEADER } },
      select: { fileName: true },
    });
    expect(depois.fileName).toBe(antes.fileName);
    expect(await prisma.userRom.count({ where: { userId: contaId, sha256: SHA_COM_HEADER } })).toBe(
      1,
    );
  }, 60_000);

  it('recusa o que não é ROM, apaga a quarentena e não promove nada', async () => {
    const cookie = await logar(conta);
    const lixo = naoEUmaRom();
    const autorizacao = await autorizacaoDeEnvio(cookie, { sizeBytes: lixo.length });
    expect((await enviar(autorizacao.url, lixo, autorizacao.contentType)).status).toBe(200);
    const antes = await prisma.userRom.count({ where: { userId: contaId } });

    const resposta = await concluir(cookie, autorizacao.uploadId, 'nao-e-rom.sfc');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { rom: ['CONTEUDO_NAO_RECONHECIDO'] },
    });
    // Nada promovido, nada na biblioteca — e a quarentena limpa, que é o
    // último item do escopo da ADR 0014.
    expect(await prisma.userRom.count({ where: { userId: contaId } })).toBe(antes);
    expect(await armazenamento.existe(chaveDoEnvio(contaId, autorizacao.uploadId))).toBe(false);
    expect(
      await armazenamento.existe(`roms/${createHash('sha256').update(lixo).digest('hex')}`),
    ).toBe(false);
  }, 60_000);

  it('recusa ROM compactada com o motivo que a pessoa precisa ler', async () => {
    const cookie = await logar(conta);
    const zip = arquivoZip();
    const autorizacao = await autorizacaoDeEnvio(cookie, { sizeBytes: zip.length });
    expect((await enviar(autorizacao.url, zip, autorizacao.contentType)).status).toBe(200);

    const resposta = await concluir(cookie, autorizacao.uploadId, 'jogo.sfc');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ details: { rom: ['SISTEMA_DIVERGENTE'] } });
    expect(await armazenamento.existe(chaveDoEnvio(contaId, autorizacao.uploadId))).toBe(false);
  }, 60_000);

  it('recusa nome sem extensão de sistema, sem inventar um', async () => {
    const cookie = await logar(conta);
    const autorizacao = await autorizacaoDeEnvio(cookie);
    expect((await enviar(autorizacao.url, ROM, autorizacao.contentType)).status).toBe(200);

    const resposta = await concluir(cookie, autorizacao.uploadId, 'jogo.zip');

    expect(resposta.statusCode).toBe(422);
    expect(resposta.json()).toMatchObject({ details: { rom: ['EXTENSAO_NAO_RECONHECIDA'] } });
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

/**
 * O critério de aceite da issue #134: ROM cujo MD5 bate com uma entrada do
 * No-Intro é reconhecida na confirmação do upload, mesmo sem SHA-256 nenhum
 * em `game_roms` — é exatamente a forma como a importação em lote
 * (`scripts/no-intro/importar-no-intro.ts`) povoa o catálogo: sem
 * `storageKey`, sem `sha256`, só o hash que o banco público traz.
 */
describe('POST /api/library/uploads/:uploadId/complete — reconhecimento por MD5 (issue #134)', () => {
  it('reconhece pelo MD5 quando o catálogo não tem SHA-256 nenhum para o jogo', async () => {
    const marcador = new Uint8Array(randomBytes(32));
    const rom = romDeSnes({ marcador });
    const md5DoArquivo = createHash('md5').update(rom).digest('hex');

    await prisma.system.upsert({
      where: { id: 'snes' },
      create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
      update: {},
    });
    const slug = `zz-teste-upload-md5-${randomUUID().slice(0, 8)}`;
    slugsMd5Criados.push(slug);
    const jogo = await prisma.game.create({
      data: {
        slug,
        title: 'Jogo importado do No-Intro',
        systemId: 'snes',
        isHomebrew: false,
        // Igual à importação em lote: sha256 nulo, só o md5 que o No-Intro
        // cataloga — é o que a issue #134 chama de "banco sem SHA-256".
        roms: { create: { md5: md5DoArquivo, sizeBytes: rom.length } },
      },
      select: { id: true },
    });

    const cookie = await logar(conta);
    const corpo = await biblioteca(cookie, contaId, rom, 'importado-do-no-intro.sfc');

    expect(corpo.gameId).toBe(jogo.id);

    const linha = await prisma.userRom.findUniqueOrThrow({
      where: { userId_sha256: { userId: contaId, sha256: corpo.sha256 } },
      select: { gameId: true, md5: true },
    });
    expect(linha.gameId).toBe(jogo.id);
    // O MD5 calculado no upload foi persistido — é ele que o reprocessamento
    // (issue #114) reaproveitaria se o catálogo aprendesse este jogo depois.
    expect(linha.md5).toBe(md5DoArquivo);
  }, 60_000);

  it('ROM sem match nenhum, nem por SHA-256 nem por MD5, fica com game_id nulo — sem erro', async () => {
    const marcador = new Uint8Array(randomBytes(32));
    const rom = romDeSnes({ marcador });

    const cookie = await logar(conta);
    const corpo = await biblioteca(cookie, contaId, rom, 'ninguem-conhece.sfc');

    expect(corpo.gameId).toBeNull();
    const linha = await prisma.userRom.findUniqueOrThrow({
      where: { userId_sha256: { userId: contaId, sha256: corpo.sha256 } },
      select: { gameId: true, md5: true },
    });
    expect(linha.gameId).toBeNull();
    expect(linha.md5).toBe(createHash('md5').update(rom).digest('hex'));
  }, 60_000);
});
