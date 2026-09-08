import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type {
  LibraryRom,
  RomDownloadResponse,
  RomFavoriteResponse,
  RomUploadResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A biblioteca pessoal da #75, contra PostgreSQL e MinIO de verdade.
 *
 * O coração deste arquivo é a garantia da
 * [ADR 0013](../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md): duas
 * pessoas com o mesmo conteúdo dividem **um** objeto em `roms/<sha256>`, e
 * remover a ROM de uma delas não pode apagar o arquivo da outra. Nada disso é
 * afirmação nossa — quem responde é o MinIO, com um `existe` e com os bytes
 * que a URL assinada entrega depois da remoção alheia.
 *
 * Como nos outros arquivos da suíte, o bucket é o de desenvolvimento
 * (docs/adr/0022): cada ROM tem conteúdo único por execução, e o `afterAll`
 * apaga exatamente o que sobrou do que se criou.
 */
const SENHA = 'cavalo-bateria-grampo';

/** Todo request deste arquivo sai deste IP. Ver o cabeçalho de sessoes.integration.test.ts. */
const IP_DO_ARQUIVO = '198.51.100.61';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dona = rastro.identidadeNova('estante');
const outra = rastro.identidadeNova('vizinha');

const identificadores = new Map<string, string>();

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

type RespostaInjetada = Awaited<ReturnType<FastifyInstance['inject']>>;

/**
 * Uma ROM diferente a cada chamada.
 *
 * O objeto promovido mora em `roms/<sha256>`, caminho compartilhado no bucket:
 * conteúdo fixo faria duas execuções simultâneas disputarem o mesmo arquivo, e
 * uma apagaria — testando remoção! — o objeto que a outra ainda usa.
 */
function romInedita(): Uint8Array {
  return romDeSnes({ marcador: new Uint8Array(randomBytes(32)) });
}

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

/**
 * O BYOR inteiro numa chamada: pede a URL, manda os bytes para o MinIO e
 * conclui. A ROM entra pelo mesmo caminho da pessoa de verdade — nada de
 * `prisma.userRom.create` com uma chave inventada, que testaria a remoção
 * contra um objeto que ninguém promoveu.
 */
async function enviarRom(
  identidade: { email: string },
  cookie: string,
  conteudo: Uint8Array,
  fileName: string,
): Promise<string> {
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
  objetosCriados.push(
    `quarentena/${identificadores.get(identidade.email) ?? ''}/${ticket.uploadId}`,
  );

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

async function listar(cookie: string): Promise<LibraryRom[]> {
  const resposta = await app.inject({
    method: 'GET',
    url: '/api/library/roms',
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<LibraryRom[]>();
}

async function remover(cookie: string | undefined, romId: string): Promise<RespostaInjetada> {
  return app.inject({ method: 'DELETE', url: `/api/library/roms/${romId}`, ...comCookie(cookie) });
}

async function favoritar(
  cookie: string | undefined,
  romId: string,
  favorito: boolean,
): Promise<RespostaInjetada> {
  return app.inject({
    method: favorito ? 'PUT' : 'DELETE',
    url: `/api/library/roms/${romId}/favorite`,
    ...comCookie(cookie),
  });
}

async function baixarBytes(cookie: string, romId: string): Promise<Uint8Array> {
  const autorizacao = await app.inject({
    method: 'GET',
    url: `/api/library/roms/${romId}/download`,
    ...comCookie(cookie),
  });
  expect(autorizacao.statusCode).toBe(200);

  const resposta = await fetch(autorizacao.json<RomDownloadResponse>().url);
  expect(resposta.status).toBe(200);
  return new Uint8Array(await resposta.arrayBuffer());
}

/**
 * O corpo do erro sem o `requestId`.
 *
 * Ele é diferente em toda resposta por desenho — serve para achar a requisição
 * no log, e não descreve recurso nenhum. Tudo o mais precisa ser idêntico
 * entre a ROM alheia e o id que nunca existiu; é aí que moraria o oráculo, se
 * houvesse um.
 */
function corpoSemRastro(resposta: RespostaInjetada): Record<string, unknown> {
  const corpo = resposta.json<Record<string, unknown>>();
  delete corpo['requestId'];
  return corpo;
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, dona);
  await criarConta(criador, outra);
  await criador.close();

  for (const identidade of [dona, outra]) {
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: identidade.email } });
    identificadores.set(identidade.email, usuario.id);
  }
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

describe('GET /api/library/roms', () => {
  it('lista as ROMs de quem pediu, e só as dela', async () => {
    const cookieDaDona = await logar(dona);
    const cookieDaOutra = await logar(outra);

    const minha = await enviarRom(dona, cookieDaDona, romInedita(), 'Guerra_nas_Estrelas.sfc');
    const dela = await enviarRom(outra, cookieDaOutra, romInedita(), 'so-dela.sfc');

    const lista = await listar(cookieDaDona);

    expect(lista.map((rom) => rom.id)).toContain(minha);
    expect(lista.map((rom) => rom.id)).not.toContain(dela);
  }, 60_000);

  it('etiqueta a ROM não reconhecida com o nome do arquivo e o sistema da extensão', async () => {
    // O caso comum do BYOR: o catálogo só conhece homebrew, então o hash de um
    // arquivo qualquer não casa com nada e `gameId` volta nulo. A etiqueta não
    // pode virar "não identificado" por causa disso.
    const cookie = await logar(dona);
    const romId = await enviarRom(dona, cookie, romInedita(), 'Chrono_Trigger_(USA).sfc');

    const rom = (await listar(cookie)).find((item) => item.id === romId);

    expect(rom).toMatchObject({
      title: 'Chrono Trigger (USA)',
      systemId: 'snes',
      gameId: null,
      coverUrl: null,
      fileName: 'Chrono_Trigger_(USA).sfc',
      isFavorite: false,
    });
  }, 60_000);

  it('não devolve a chave do objeto, que é endereço interno do bucket', async () => {
    const cookie = await logar(dona);
    await enviarRom(dona, cookie, romInedita(), 'sem-chave.sfc');

    const [rom] = await listar(cookie);

    expect(rom).toBeDefined();
    expect(Object.keys(rom as unknown as Record<string, unknown>).sort()).toEqual(
      [
        'coverUrl',
        'fileName',
        'gameId',
        'id',
        'isFavorite',
        'sha256',
        'sizeBytes',
        'systemId',
        'title',
        'uploadedAt',
      ].sort(),
    );
  }, 60_000);

  it('recusa quem não tem sessão', async () => {
    const resposta = await app.inject({
      method: 'GET',
      url: '/api/library/roms',
      ...comCookie(undefined),
    });

    expect(resposta.statusCode).toBe(401);
    expect(resposta.json()).toMatchObject({ code: 'UNAUTHENTICATED' });
  });
});

describe('favoritar e desfavoritar', () => {
  it('persiste no banco e põe o favorito na frente da estante', async () => {
    const cookie = await logar(dona);
    const romId = await enviarRom(dona, cookie, romInedita(), 'favorita.sfc');

    const marcada = await favoritar(cookie, romId, true);

    expect(marcada.statusCode).toBe(200);
    expect(marcada.json<RomFavoriteResponse>()).toEqual({ romId, isFavorite: true });
    // O critério de aceite pede que o F5 confirme: quem responde aqui é uma
    // leitura nova, e não o corpo da mutação.
    const lista = await listar(cookie);
    expect(lista[0]?.id).toBe(romId);
    expect(lista[0]?.isFavorite).toBe(true);
    expect(await prisma.userRom.count({ where: { id: romId, isFavorite: true } })).toBe(1);
  }, 60_000);

  it('desfavoritar volta atrás, e repetir não muda nada', async () => {
    const cookie = await logar(dona);
    const romId = await enviarRom(dona, cookie, romInedita(), 'vai-e-volta.sfc');

    await favoritar(cookie, romId, true);
    await favoritar(cookie, romId, true);
    const desmarcada = await favoritar(cookie, romId, false);
    await favoritar(cookie, romId, false);

    expect(desmarcada.json<RomFavoriteResponse>()).toEqual({ romId, isFavorite: false });
    expect(await prisma.userRom.count({ where: { id: romId, isFavorite: false } })).toBe(1);
  }, 60_000);

  it('a ROM de outra pessoa responde o mesmo 404 de um id que nunca existiu', async () => {
    const cookieDaDona = await logar(dona);
    const romId = await enviarRom(dona, cookieDaDona, romInedita(), 'nao-e-sua.sfc');

    const cookieDaOutra = await logar(outra);
    const alheia = await favoritar(cookieDaOutra, romId, true);
    const inexistente = await favoritar(cookieDaOutra, randomUUID(), true);

    expect(alheia.statusCode).toBe(404);
    expect(corpoSemRastro(alheia)).toEqual(corpoSemRastro(inexistente));
    expect(alheia.json()).toMatchObject({ code: 'NOT_FOUND', message: 'ROM não encontrado' });
    // E a recusa não foi só de resposta: nada foi marcado.
    expect(await prisma.userRom.count({ where: { id: romId, isFavorite: false } })).toBe(1);
  }, 60_000);
});

describe('DELETE /api/library/roms/:romId', () => {
  it('remove a referência sem apagar o objeto que outra pessoa ainda referencia', async () => {
    // A garantia central da ADR 0013, com duas contas de verdade e o mesmo
    // conteúdo: uma remove, e a ROM da outra continua inteira — a linha, a
    // listagem e os bytes.
    const conteudo = romInedita();
    const sha = createHash('sha256').update(conteudo).digest('hex');

    const cookieDaDona = await logar(dona);
    const daDona = await enviarRom(dona, cookieDaDona, conteudo, 'compartilhada.sfc');

    const cookieDaOutra = await logar(outra);
    const daOutra = await enviarRom(outra, cookieDaOutra, conteudo, 'compartilhada.sfc');

    // Duas linhas, um objeto: é o dedupe da ADR 0013 acontecendo de verdade.
    expect(daOutra).not.toBe(daDona);
    expect(await prisma.userRom.count({ where: { sha256: sha } })).toBe(2);

    const removida = await remover(cookieDaDona, daDona);

    expect(removida.statusCode).toBe(200);
    expect(removida.json()).toEqual({ status: 'rom-removida' });
    expect((await listar(cookieDaDona)).map((rom) => rom.id)).not.toContain(daDona);

    // O objeto continua no bucket, e não porque nós dizemos: porque o MinIO
    // diz — e porque os bytes ainda voltam pela URL assinada da outra pessoa.
    expect(await armazenamento.existe(`roms/${sha}`)).toBe(true);
    expect((await listar(cookieDaOutra)).map((rom) => rom.id)).toContain(daOutra);
    expect(await baixarBytes(cookieDaOutra, daOutra)).toEqual(conteudo);

    // E agora a última referência: aí, sim, o objeto morre junto.
    expect((await remover(cookieDaOutra, daOutra)).statusCode).toBe(200);
    expect(await prisma.userRom.count({ where: { sha256: sha } })).toBe(0);
    expect(await armazenamento.existe(`roms/${sha}`)).toBe(false);
  }, 90_000);

  it('a ROM de outra pessoa responde o mesmo 404 de um id que nunca existiu, e sobrevive', async () => {
    const conteudo = romInedita();
    const sha = createHash('sha256').update(conteudo).digest('hex');

    const cookieDaDona = await logar(dona);
    const romId = await enviarRom(dona, cookieDaDona, conteudo, 'nem-pensar.sfc');

    const cookieDaOutra = await logar(outra);
    const alheia = await remover(cookieDaOutra, romId);
    const inexistente = await remover(cookieDaOutra, randomUUID());

    expect(alheia.statusCode).toBe(404);
    expect(corpoSemRastro(alheia)).toEqual(corpoSemRastro(inexistente));
    expect(alheia.json()).toMatchObject({ code: 'NOT_FOUND', message: 'ROM não encontrado' });

    // A recusa não é só de resposta: a linha e o objeto seguem onde estavam.
    expect(await prisma.userRom.count({ where: { id: romId } })).toBe(1);
    expect(await armazenamento.existe(`roms/${sha}`)).toBe(true);
    expect(await baixarBytes(cookieDaDona, romId)).toEqual(conteudo);
  }, 90_000);

  it('remover de novo a mesma ROM responde 404, e não erro do banco', async () => {
    const cookie = await logar(dona);
    const romId = await enviarRom(dona, cookie, romInedita(), 'duas-vezes.sfc');

    expect((await remover(cookie, romId)).statusCode).toBe(200);
    const segunda = await remover(cookie, romId);

    expect(segunda.statusCode).toBe(404);
    expect(segunda.json()).toMatchObject({ code: 'NOT_FOUND' });
  }, 60_000);

  it('recusa quem não tem sessão, sem apagar nada', async () => {
    const cookie = await logar(dona);
    const romId = await enviarRom(dona, cookie, romInedita(), 'protegida.sfc');

    const resposta = await remover(undefined, romId);

    expect(resposta.statusCode).toBe(401);
    expect(await prisma.userRom.count({ where: { id: romId } })).toBe(1);
  }, 60_000);

  it('recusa id que não é uuid, antes de tocar no banco', async () => {
    const cookie = await logar(dona);

    const resposta = await remover(cookie, 'nao-e-um-uuid');

    expect(resposta.statusCode).toBe(400);
    expect(resposta.json()).toMatchObject({ code: 'VALIDATION_FAILED' });
  }, 60_000);
});
