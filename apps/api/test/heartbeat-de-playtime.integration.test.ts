import { createHash, randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type { HeartbeatResponse, RomUploadResponse } from '@pixelvault/contracts';
import { TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * O heartbeat de playtime da #119, contra PostgreSQL de verdade — o
 * critério de aceite da issue, literal: heartbeats legítimos somam playtime
 * corretamente; heartbeat fora de janela razoável não credita nada indevido;
 * uma ROM não reconhecida pelo catálogo não credita nada. Ver docs/adr/0009
 * para o raciocínio de cada uma.
 *
 * "Aba oculta não credita tempo" é, ao nível desta suíte, a ausência de
 * chamada: o front (`heartbeat-de-playtime.test.ts`) é quem garante que a
 * aba oculta nunca dispara o heartbeat. Aqui a garantia correspondente é que
 * NENHUM heartbeat significa NENHUM crédito — sem linha de `UserGame`, sem
 * total maior que zero.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.119';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dono = rastro.identidadeNova('heartbeat');
const intruso = rastro.identidadeNova('hb-alheio');
let donoId: string;

const NOME_DO_ARQUIVO = 'jogo-com-heartbeat.sfc';
const NOME_DO_ARQUIVO_NAO_RECONHECIDO = 'rom-sem-jogo.sfc';

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

const objetosDeRom: string[] = [];
let jogoId: string;

let app: FastifyInstance;
/** ROM cujo hash bate com um jogo do catálogo — o caso "creditado". */
let romIdReconhecida: string;
/** ROM sem correspondência no catálogo — o caso "sem-jogo-reconhecido". */
let romIdNaoReconhecida: string;

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

async function heartbeat(cookie: string | undefined, romIdAlvo: string): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: `/api/progress/heartbeat/${romIdAlvo}`,
    ...comCookie(cookie),
  });
}

/** Recua `lastPlayedAt` daquela conta+jogo — simula o hiato sem esperar de verdade. */
async function recuarUltimoHeartbeat(gameId: string, segundosAtras: number): Promise<void> {
  await prisma.userGame.update({
    where: { userId_gameId: { userId: donoId, gameId } },
    data: { lastPlayedAt: new Date(Date.now() - segundosAtras * 1000) },
  });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, dono);
  await criarConta(criador, intruso);
  await criador.close();

  donoId = (await prisma.user.findUniqueOrThrow({ where: { email: dono.email } })).id;

  // O catálogo conhece uma das duas ROMs pelo hash — a outra fica sem
  // `gameId` de propósito, para exercitar "sem-jogo-reconhecido".
  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });

  const romReconhecida = romDeSnes({ marcador: new Uint8Array(32).fill(0x11) });
  const romNaoReconhecida = romDeSnes({ marcador: new Uint8Array(32).fill(0x22) });
  const shaReconhecida = createHash('sha256').update(romReconhecida).digest('hex');

  jogoId = (
    await prisma.game.create({
      data: {
        slug: `zz-teste-heartbeat-${randomUUID().slice(0, 8)}`,
        title: 'Jogo de teste do heartbeat',
        systemId: 'snes',
        roms: { create: { sha256: shaReconhecida, sizeBytes: romReconhecida.length } },
      },
      select: { id: true },
    })
  ).id;

  app = await buildApp(configDeTeste);
  const cookieDoDono = await logar(dono);
  romIdReconhecida = await enviarRom(cookieDoDono, romReconhecida, NOME_DO_ARQUIVO);
  romIdNaoReconhecida = await enviarRom(
    cookieDoDono,
    romNaoReconhecida,
    NOME_DO_ARQUIVO_NAO_RECONHECIDO,
  );
  await app.close();
}, 60_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  await prisma.userGame.deleteMany({ where: { userId: donoId, gameId: jogoId } });
  return async () => {
    await app.close();
  };
});

afterEach(async () => {
  await prisma.userGame.deleteMany({ where: { userId: donoId, gameId: jogoId } });
});

afterAll(async () => {
  await Promise.all(objetosDeRom.map((chave) => armazenamento.apagar(chave)));
  // O jogo sai por id: `game_roms` cai por cascata com ele; `user_roms` e
  // `user_games` caem por cascata com os usuários (ver `rastro.ts`).
  await prisma.game.deleteMany({ where: { id: jogoId } });
  await rastro.limpar();
});

describe('POST /api/progress/heartbeat/:romId', () => {
  it('o primeiro heartbeat de uma sessão credita zero e só estabelece o marco', async () => {
    const cookie = await logar(dono);

    const resposta = await heartbeat(cookie, romIdReconhecida);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<HeartbeatResponse>();
    expect(corpo).toEqual({ status: 'creditado', segundosCreditados: 0, totalPlaytimeSeconds: 0 });

    const linha = await prisma.userGame.findUniqueOrThrow({
      where: { userId_gameId: { userId: donoId, gameId: jogoId } },
    });
    expect(linha.lastPlayedAt).not.toBeNull();
    expect(linha.totalPlaytimeSeconds).toBe(0);
  });

  it('heartbeats legítimos somam playtime corretamente', async () => {
    const cookie = await logar(dono);
    await heartbeat(cookie, romIdReconhecida); // estabelece o marco, credita 0

    await recuarUltimoHeartbeat(jogoId, 5); // "5s atrás" — dentro do teto
    const segundo = (await heartbeat(cookie, romIdReconhecida)).json<HeartbeatResponse>();
    expect(segundo).toMatchObject({ status: 'creditado', segundosCreditados: 5 });
    expect(segundo).toMatchObject({ totalPlaytimeSeconds: 5 });

    await recuarUltimoHeartbeat(jogoId, 12); // mais um intervalo dentro do teto
    const terceiro = (await heartbeat(cookie, romIdReconhecida)).json<HeartbeatResponse>();
    expect(terceiro).toMatchObject({ status: 'creditado', segundosCreditados: 12 });
    expect(terceiro).toMatchObject({ totalPlaytimeSeconds: 17 });
  });

  it('heartbeat depois de um hiato longo (aba oculta e voltou) credita só o teto, nunca o hiato inteiro', async () => {
    const cookie = await logar(dono);
    await heartbeat(cookie, romIdReconhecida);

    await recuarUltimoHeartbeat(jogoId, 60 * 60); // uma hora de hiato
    const resposta = (await heartbeat(cookie, romIdReconhecida)).json<HeartbeatResponse>();

    expect(resposta).toMatchObject({
      status: 'creditado',
      segundosCreditados: TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS,
      totalPlaytimeSeconds: TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS,
    });
  });

  it('heartbeat que chega quase junto do anterior (replay/duplicata) credita perto de zero, nunca o mesmo intervalo duas vezes', async () => {
    const cookie = await logar(dono);
    await heartbeat(cookie, romIdReconhecida);
    await recuarUltimoHeartbeat(jogoId, 10);

    const primeiro = (await heartbeat(cookie, romIdReconhecida)).json<HeartbeatResponse>();
    expect(primeiro).toMatchObject({ status: 'creditado', segundosCreditados: 10 });

    // Replay imediato: sem recuar o marco de novo, o intervalo real desde o
    // heartbeat anterior é de milissegundos — não os mesmos 10s de novo.
    const replay = (await heartbeat(cookie, romIdReconhecida)).json<HeartbeatResponse>();
    expect(replay.status).toBe('creditado');
    if (replay.status === 'creditado') {
      expect(replay.segundosCreditados).toBeLessThanOrEqual(1);
      expect(replay.totalPlaytimeSeconds).toBeLessThanOrEqual(11);
    }
  });

  it('duas abas heartbeando ao mesmo tempo não dobram o crédito do mesmo intervalo', async () => {
    const cookie = await logar(dono);
    await heartbeat(cookie, romIdReconhecida);
    await recuarUltimoHeartbeat(jogoId, 10);

    // Duas "abas" da mesma conta, batendo a rota ao mesmo tempo.
    const [a, b] = await Promise.all([
      heartbeat(cookie, romIdReconhecida),
      heartbeat(cookie, romIdReconhecida),
    ]);
    const corpoA = a.json<HeartbeatResponse>();
    const corpoB = b.json<HeartbeatResponse>();
    const creditoA = corpoA.status === 'creditado' ? corpoA.segundosCreditados : 0;
    const creditoB = corpoB.status === 'creditado' ? corpoB.segundosCreditados : 0;

    // As duas dividem os mesmos ~10s reais decorridos — a soma não pode
    // aproximar 20s, que seria o dobro (docs/adr/0009, decisão 2).
    expect(creditoA + creditoB).toBeLessThanOrEqual(11);

    const linha = await prisma.userGame.findUniqueOrThrow({
      where: { userId_gameId: { userId: donoId, gameId: jogoId } },
    });
    expect(linha.totalPlaytimeSeconds).toBe(creditoA + creditoB);
  });

  it('ROM sem gameId reconhecido não credita nada — sucesso, não erro', async () => {
    const cookie = await logar(dono);

    const resposta = await heartbeat(cookie, romIdNaoReconhecida);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json<HeartbeatResponse>()).toEqual({ status: 'sem-jogo-reconhecido' });

    const linha = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId: donoId, gameId: jogoId } },
    });
    expect(linha).toBeNull();
  });

  it('sem heartbeat nenhum, nenhum playtime é creditado — a mesma garantia que a aba oculta usa', async () => {
    const linha = await prisma.userGame.findUnique({
      where: { userId_gameId: { userId: donoId, gameId: jogoId } },
    });
    expect(linha).toBeNull();
  });

  it('romId de outra conta responde o mesmo 404 de um romId que nunca existiu', async () => {
    const cookieDoIntruso = await logar(intruso);
    const idInexistente = '11111111-1111-4111-8111-111111111111';

    const respostaAlheia = await heartbeat(cookieDoIntruso, romIdReconhecida);
    const respostaInexistente = await heartbeat(cookieDoIntruso, idInexistente);

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
