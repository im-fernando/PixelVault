import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { RomDownloadResponse, RomUploadResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import {
  VALIDADE_PADRAO_EM_SEGUNDOS,
  type ArmazenamentoDeObjetos,
} from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * O download autorizado da #73, contra PostgreSQL e MinIO de verdade.
 *
 * O que está sob teste é justamente o que um dublê inventaria: que a URL
 * assinada pela API abre o arquivo certo no storage que a assinou, que a ROM
 * de outra pessoa responde o mesmo 404 de um id que nunca existiu, e que a
 * assinatura vence de verdade. Nenhuma das três é afirmação nossa — as três
 * são resposta do MinIO.
 *
 * Como nos outros arquivos da suíte, o bucket é o de desenvolvimento
 * (docs/adr/0022): aqui se apaga exatamente o que se criou, sem listar nada.
 */
const SENHA = 'cavalo-bateria-grampo';

/** Todo request deste arquivo sai deste IP. Ver o cabeçalho de sessoes.integration.test.ts. */
const IP_DO_ARQUIVO = '198.51.100.60';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dono = rastro.identidadeNova('download');
const intruso = rastro.identidadeNova('download-alheio');
let donoId: string;

/**
 * A ROM deste arquivo, única por execução.
 *
 * Precisa passar pela verificação de verdade (#72) e precisa ser diferente a
 * cada rodada: o objeto promovido mora em `roms/<sha256>`, caminho
 * compartilhado no bucket, e conteúdo fixo faria duas execuções simultâneas
 * disputarem — e uma apagar, na limpeza, o objeto que a outra ainda usa.
 */
const ROM = romDeSnes({ marcador: new Uint8Array(randomBytes(32)) });
const SHA_DA_ROM = createHash('sha256').update(ROM).digest('hex');
const NOME_DO_ARQUIVO = 'jogo-do-download.sfc';

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
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
/** A ROM do dono, enviada uma vez no `beforeAll` e usada por todos os testes. */
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

async function pedirDownload(cookie: string | undefined, id: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'GET',
    url: `/api/library/roms/${id}/download`,
    ...comCookie(cookie),
  });
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

/**
 * O BYOR inteiro numa chamada: pede a URL de envio, manda os bytes para o
 * MinIO e conclui. A ROM entra na biblioteca pelo mesmo caminho que a do
 * usuário de verdade — nada de `prisma.userRom.create` com uma chave
 * inventada, que testaria o download contra um objeto que ninguém verificou.
 */
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
  objetosCriados.push(`quarentena/${donoId}/${ticket.uploadId}`);

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
  objetosCriados.push(`roms/${corpo.sha256}`);
  return corpo.romId;
}

/**
 * O corpo do erro sem o `requestId`.
 *
 * Ele é diferente em toda resposta da API por desenho — serve para achar a
 * requisição no log, e não descreve recurso nenhum. Tudo o mais precisa ser
 * idêntico entre a ROM alheia e o id que nunca existiu; é aí que moraria o
 * oráculo, se houvesse um.
 */
function corpoSemRastro(resposta: RespostaInjetada): Record<string, unknown> {
  const corpo = resposta.json<Record<string, unknown>>();
  delete corpo['requestId'];
  return corpo;
}

async function baixar(url: string): Promise<Uint8Array> {
  const resposta = await fetch(url);
  expect(resposta.status).toBe(200);
  return new Uint8Array(await resposta.arrayBuffer());
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
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  await Promise.all(objetosCriados.map((chave) => armazenamento.apagar(chave)));
  await rastro.limpar();
});

describe('GET /api/library/roms/:romId/download', () => {
  it('entrega ao dono uma URL que abre exatamente os bytes dele', async () => {
    const cookie = await logar(dono);

    const resposta = await pedirDownload(cookie, romId);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<RomDownloadResponse>();
    expect(corpo).toMatchObject({
      sha256: SHA_DA_ROM,
      sizeBytes: ROM.length,
      fileName: NOME_DO_ARQUIVO,
      expiresInSeconds: VALIDADE_PADRAO_EM_SEGUNDOS,
    });

    // O critério de aceite da issue: não basta a URL responder 200 — os bytes
    // que voltam têm que ser os que subiram, e não os de outra ROM qualquer.
    const baixada = await baixar(corpo.url);
    expect(baixada).toEqual(ROM);
    expect(createHash('sha256').update(baixada).digest('hex')).toBe(SHA_DA_ROM);
  }, 60_000);

  it('não devolve a chave do objeto, que é endereço interno do bucket', async () => {
    const cookie = await logar(dono);

    const corpo = (await pedirDownload(cookie, romId)).json<Record<string, unknown>>();

    expect(corpo['storageKey']).toBeUndefined();
    // A chave aparece dentro da URL assinada, e só ali — a resposta não a
    // repete como campo, nem ensina o formato de `roms/<sha256>` como dado.
    expect(Object.keys(corpo).sort()).toEqual(
      ['expiresInSeconds', 'fileName', 'sha256', 'sizeBytes', 'url'].sort(),
    );
  }, 60_000);

  it('a URL vale por pouco tempo, e o storage recusa a vencida', async () => {
    // Duas afirmações, e nenhuma delas é promessa nossa. A primeira é o que a
    // API pediu ao assinar, legível na própria URL (`X-Amz-Expires`); a
    // segunda é o MinIO recusando uma assinatura vencida sobre este mesmo
    // objeto — o mecanismo (SigV4) que o R2 também aplica. Por isso o teste
    // espera de verdade: relógio adiantado no processo do teste não chega ao
    // outro lado da conexão.
    const cookie = await logar(dono);
    const corpo = (await pedirDownload(cookie, romId)).json<RomDownloadResponse>();

    const validadeAssinada = new URL(corpo.url).searchParams.get('X-Amz-Expires');
    expect(validadeAssinada).toBe(String(VALIDADE_PADRAO_EM_SEGUNDOS));

    const vencida = await armazenamento.assinarLeitura(`roms/${SHA_DA_ROM}`, {
      validadeEmSegundos: 1,
    });
    await new Promise((resolva) => setTimeout(resolva, 2_000));

    const recusada = await fetch(vencida);
    expect(recusada.status).toBe(403);
    expect(await recusada.text()).toContain('Request has expired');
    // E o 403 acima foi expiração, não objeto sumido: assinada de novo, a
    // mesma chave entrega os mesmos bytes.
    expect(await baixar(await armazenamento.assinarLeitura(`roms/${SHA_DA_ROM}`))).toEqual(ROM);
  }, 60_000);

  it('a ROM de outra pessoa responde o mesmo 404 de um id que nunca existiu', async () => {
    // O coração da issue. Um 403 aqui diria "existe, mas não é sua", e quem
    // varre ids alheios não pode separar as duas coisas: as respostas têm que
    // ser iguais byte a byte (docs/adr/0013 e o `autorizarOuNaoEncontrado`
    // da #48).
    const cookie = await logar(intruso);

    const alheia = await pedirDownload(cookie, romId);
    const inexistente = await pedirDownload(cookie, randomUUID());

    expect(alheia.statusCode).toBe(404);
    expect(alheia.statusCode).toBe(inexistente.statusCode);
    expect(corpoSemRastro(alheia)).toEqual(corpoSemRastro(inexistente));
    expect(alheia.json()).toMatchObject({ code: 'NOT_FOUND', message: 'ROM não encontrado' });
  }, 60_000);

  it('a ROM continua inteira depois da tentativa de fora', async () => {
    // A recusa não é só de resposta: nada foi assinado, e o objeto e a linha
    // do dono seguem onde estavam.
    const cookie = await logar(dono);

    const corpo = (await pedirDownload(cookie, romId)).json<RomDownloadResponse>();

    expect(await baixar(corpo.url)).toEqual(ROM);
    expect(
      await prisma.userRom.count({ where: { id: romId, userId: donoId, sha256: SHA_DA_ROM } }),
    ).toBe(1);
  }, 60_000);

  it('recusa quem não tem sessão, sem assinar nada', async () => {
    const resposta = await pedirDownload(undefined, romId);

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(resposta.json<Record<string, unknown>>()['url']).toBeUndefined();
  });

  it('recusa id que não é uuid, antes de tocar no banco', async () => {
    const cookie = await logar(dono);

    const resposta = await pedirDownload(cookie, 'nao-e-um-uuid');

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  }, 60_000);
});
