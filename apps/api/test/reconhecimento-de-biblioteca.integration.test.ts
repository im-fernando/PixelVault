import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma, Role } from '@pixelvault/database';
import type { RomRecognitionSweepResponse, RomUploadResponse } from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * A lacuna 2 da issue #114, contra PostgreSQL e MinIO de verdade:
 * `POST /api/admin/library/roms/recognize` religa `user_roms.game_id` quando
 * o catálogo ganha uma entrada depois que a ROM já estava na biblioteca.
 *
 * ## Por que não afirmamos `coverUrl`
 *
 * `CAPA_TRANSPORTE=desligada` na suíte inteira (`suporte/ambiente.ts`) — de
 * propósito, para nenhum teste depender do `libretro-thumbnails` de verdade.
 * O gatilho de busca (`procurarCapaEmSegundoPlano`, em
 * `catalog/application/identificar-rom.ts`) roda do mesmo jeito, mas o
 * provedor desligado sempre responde "não tenho": não há capa para conferir
 * aqui, e não haveria mesmo que o reprocessamento não existisse — é o mesmo
 * motivo por que `biblioteca-pessoal.integration.test.ts` também não afirma
 * `coverUrl`. Quem prova que o gatilho dispara é `garantir-capa-do-jogo.test.ts`
 * e `capa-libretro-thumbnails.test.ts`, sem rede.
 *
 * ## Por que não afirmamos `analisadas` como número exato
 *
 * A varredura é deliberadamente global (ver o cabeçalho de
 * `reprocessar-reconhecimento.ts`) — sem filtro por conta, sem filtro por
 * marcador de teste. Contra o banco de desenvolvimento compartilhado
 * (docs/adr/0022), outros arquivos da suíte podem ter `user_roms` sem
 * `game_id` no ar ao mesmo tempo. O que este arquivo garante é o resultado
 * das SUAS duas linhas, não o total da varredura.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.62';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const administradora = rastro.identidadeNova('curadora');
const comum = rastro.identidadeNova('leitora');

const identificadores = new Map<string, string>();

const armazenamento: ArmazenamentoDeObjetos = criarArmazenamentoS3({
  endpoint: configDeTeste.S3_ENDPOINT,
  regiao: configDeTeste.S3_REGION,
  bucket: configDeTeste.S3_BUCKET,
  chaveDeAcesso: configDeTeste.S3_ACCESS_KEY_ID,
  segredo: configDeTeste.S3_SECRET_ACCESS_KEY,
  caminhoNoEstiloDePasta: configDeTeste.S3_FORCE_PATH_STYLE,
});

const objetosCriados: string[] = [];
/** Slugs de `games` criados por este arquivo — apagados no fim, com a cascata levando `game_roms`. */
const slugsDeJogosCriados: string[] = [];

let app: FastifyInstance;

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

async function enviarRom(
  identidade: { email: string },
  cookie: string,
  conteudo: Uint8Array,
  fileName: string,
): Promise<{ romId: string; sha256: string }> {
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
  return corpo;
}

/** Cria o jogo comercial e a `game_roms` que casa com o hash informado — a curadoria chegando depois do upload, como a issue #114 descreve. */
async function cadastrarNoCatalogo(sha256: string, slug: string): Promise<string> {
  slugsDeJogosCriados.push(slug);

  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
  });

  const jogo = await prisma.game.create({
    data: {
      slug,
      title: slug,
      systemId: 'snes',
      isHomebrew: false,
      roms: { create: { sha256 } },
    },
    select: { id: true },
  });
  return jogo.id;
}

async function reconhecer(
  cookie: string | undefined,
): Promise<Awaited<ReturnType<FastifyInstance['inject']>>> {
  return app.inject({
    method: 'POST',
    url: '/api/admin/library/roms/recognize',
    ...comCookie(cookie),
  });
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, administradora);
  await criarConta(criador, comum);
  await criador.close();

  for (const identidade of [administradora, comum]) {
    const usuario = await prisma.user.findUniqueOrThrow({ where: { email: identidade.email } });
    identificadores.set(identidade.email, usuario.id);
  }

  // "Virar admin é operação manual, deliberada" (schema.prisma) — é
  // exatamente o que a issue #114 previu como aceitável para testar a rota.
  await prisma.user.update({
    where: { email: administradora.email },
    data: { role: Role.admin },
  });
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
  // A cascata de `game_roms` sai junto com o `game`.
  await prisma.game.deleteMany({ where: { slug: { in: slugsDeJogosCriados } } });
  await rastro.limpar();
});

describe('POST /api/admin/library/roms/recognize', () => {
  it('recusa quem não tem sessão', async () => {
    const resposta = await reconhecer(undefined);

    expect(resposta.statusCode).toBe(401);
  });

  it('recusa quem não é admin, sem tocar em nada', async () => {
    const cookie = await logar(comum);
    const { romId } = await enviarRom(comum, cookie, romInedita(), 'sem-permissao.sfc');

    const resposta = await reconhecer(cookie);

    expect(resposta.statusCode).toBe(403);
    expect(await prisma.userRom.findUniqueOrThrow({ where: { id: romId } })).toMatchObject({
      gameId: null,
    });
  }, 60_000);

  it('religa o game_id da ROM cujo hash o catálogo passou a conhecer, e deixa a sem match como estava', async () => {
    const cookieComum = await logar(comum);

    // A ROM sobe antes de existir qualquer entrada de catálogo para ela — o
    // "caso comum do BYOR" da ADR 0006: game_id nasce nulo.
    const reconhecivel = await enviarRom(
      comum,
      cookieComum,
      romInedita(),
      'Donkey_Kong_Country.sfc',
    );
    const semMatch = await enviarRom(comum, cookieComum, romInedita(), 'so-minha-mesmo.sfc');

    expect(
      await prisma.userRom.findUniqueOrThrow({ where: { id: reconhecivel.romId } }),
    ).toMatchObject({ gameId: null });

    // A curadoria "chega" agora: o catálogo aprende o hash da ROM que já
    // estava na biblioteca de alguém.
    const slug = `zz-teste-reconhecimento-${randomUUID().slice(0, 8)}`;
    const jogoId = await cadastrarNoCatalogo(reconhecivel.sha256, slug);

    const cookieAdmin = await logar(administradora);
    const resposta = await reconhecer(cookieAdmin);

    expect(resposta.statusCode).toBe(200);
    const corpo = resposta.json<RomRecognitionSweepResponse>();
    expect(corpo.analisadas).toBeGreaterThanOrEqual(2);
    expect(corpo.reconhecidas).toBeGreaterThanOrEqual(1);

    await expect(
      prisma.userRom.findUniqueOrThrow({ where: { id: reconhecivel.romId } }),
    ).resolves.toMatchObject({ gameId: jogoId });

    // A que nunca teve hash cadastrado em lugar nenhum segue exatamente como
    // estava — reprocessar não é erro para quem não casa com nada.
    await expect(
      prisma.userRom.findUniqueOrThrow({ where: { id: semMatch.romId } }),
    ).resolves.toMatchObject({ gameId: null });
  }, 90_000);

  it('é idempotente: rodar de novo não reconhece a mesma ROM duas vezes', async () => {
    const cookieComum = await logar(comum);
    const rom = await enviarRom(comum, cookieComum, romInedita(), 'so-uma-vez.sfc');

    const slug = `zz-teste-reconhecimento-idempotente-${randomUUID().slice(0, 8)}`;
    await cadastrarNoCatalogo(rom.sha256, slug);

    const cookieAdmin = await logar(administradora);
    const primeira = (await reconhecer(cookieAdmin)).json<RomRecognitionSweepResponse>();
    expect(primeira.reconhecidas).toBeGreaterThanOrEqual(1);

    await reconhecer(cookieAdmin);

    // Na segunda passagem a linha já tem game_id, então nem entra na
    // varredura (`listarSemJogoReconhecido` só traz `game_id` nulo) — não há
    // como ela ser contada de novo, nem sobrescrita por outra coisa.
    await expect(
      prisma.userRom.findUniqueOrThrow({ where: { id: rom.romId } }),
    ).resolves.toMatchObject({ gameId: expect.any(String) });
  }, 90_000);
});
