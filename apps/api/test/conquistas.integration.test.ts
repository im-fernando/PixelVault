import { randomBytes, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import type {
  AchievementListResponse,
  RomUploadResponse,
  SramUploadResponse,
  StateUploadResponse,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import type { ArmazenamentoDeObjetos } from '../src/infrastructure/storage/armazenamento-de-objetos.js';
import { criarArmazenamentoS3 } from '../src/infrastructure/storage/armazenamento-s3.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';
import { romDeSnes } from './suporte/roms-de-teste.js';

/**
 * As conquistas de plataforma da issue #120, contra PostgreSQL e MinIO de
 * verdade. O critério de aceite, literal:
 *
 * - enviar a primeira ROM desbloqueia `primeira_rom_enviada`;
 * - enviar a segunda não desbloqueia de novo (uma linha só em
 *   `user_achievements`, mesmo `unlockedAt`);
 * - as conquistas por agregação (coleção, jogos distintos) refletem o
 *   estado real da conta.
 *
 * Save state e SRAM entram pelo caminho de verdade (`POST /api/progress/...`,
 * como os outros arquivos de progresso). Coleção e jogos distintos são
 * verificados inserindo linhas direto no banco: o que está sob teste aqui é
 * a LEITURA que `achievements` faz desses números (a contagem, o limiar), não
 * o caminho de escrita — esse já tem suíte própria em `upload-de-rom` e nos
 * arquivos de save.
 */
const SENHA = 'cavalo-bateria-grampo';

const IP_DO_ARQUIVO = '198.51.100.90';

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const dona = rastro.identidadeNova('conquistas');
let donaId: string;

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
/** Os jogos de mentira criados para a conquista de jogos distintos. */
const jogosCriados: string[] = [];

let app: FastifyInstance;

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
  objetosCriados.push(`quarentena/${donaId}/${ticket.uploadId}`);

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

function base64De(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

async function gravarSram(
  cookie: string,
  romId: string,
  revision: number,
): Promise<SramUploadResponse> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/api/progress/sram/${romId}`,
    payload: { revision, dataBase64: base64De(new Uint8Array(64).fill(0x11)) },
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<SramUploadResponse>();
}

async function gravarSaveState(cookie: string, romId: string): Promise<StateUploadResponse> {
  const resposta = await app.inject({
    method: 'POST',
    url: `/api/progress/state/${romId}/0`,
    payload: {
      revision: 0,
      dataBase64: base64De(new Uint8Array(64).fill(0x22)),
      thumbnailBase64: base64De(new Uint8Array(64).fill(0x33)),
    },
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<StateUploadResponse>();
}

async function listarConquistas(cookie: string | undefined): Promise<AchievementListResponse> {
  const resposta = await app.inject({
    method: 'GET',
    url: '/api/achievements',
    ...comCookie(cookie),
  });
  expect(resposta.statusCode).toBe(200);
  return resposta.json<AchievementListResponse>();
}

function codigos(resposta: AchievementListResponse): string[] {
  return resposta.achievements.map((a) => a.code);
}

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  await criarConta(criador, dona);
  await criador.close();

  donaId = (await prisma.user.findUniqueOrThrow({ where: { email: dona.email } })).id;

  await prisma.system.upsert({
    where: { id: 'snes' },
    create: { id: 'snes', name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    update: {},
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
  await prisma.game.deleteMany({ where: { id: { in: jogosCriados } } });
  await rastro.limpar();
}, 30_000);

describe('conquista de evento: primeira ROM enviada', () => {
  it('desbloqueia no primeiro envio e não desbloqueia de novo no segundo', async () => {
    const cookie = await logar(dona);

    await enviarRom(cookie, romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }), 'a.sfc');

    const depoisDaPrimeira = await listarConquistas(cookie);
    expect(codigos(depoisDaPrimeira)).toContain('primeira_rom_enviada');
    const primeiroDesbloqueio = depoisDaPrimeira.achievements.find(
      (a) => a.code === 'primeira_rom_enviada',
    );
    expect(primeiroDesbloqueio).toBeDefined();

    await enviarRom(cookie, romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }), 'b.sfc');

    const depoisDaSegunda = await listarConquistas(cookie);
    // A mesma linha, não uma segunda: o carimbo de desbloqueio não mudou, e
    // só existe uma ocorrência do código na lista.
    expect(codigos(depoisDaSegunda).filter((c) => c === 'primeira_rom_enviada')).toHaveLength(1);
    expect(depoisDaSegunda.achievements.find((a) => a.code === 'primeira_rom_enviada')).toEqual(
      primeiroDesbloqueio,
    );
    expect(
      await prisma.userAchievement.count({
        where: { userId: donaId, code: 'primeira_rom_enviada' },
      }),
    ).toBe(1);
  }, 60_000);

  it('recusa quem não tem sessão', async () => {
    const resposta = await app.inject({ method: 'GET', url: '/api/achievements' });
    expect(resposta.statusCode).toBe(401);
  });
});

describe('conquistas de evento: save state e sincronização', () => {
  it('gravar SRAM desbloqueia "primeira sincronização", e gravar save state desbloqueia "primeiro save state"', async () => {
    const cookie = await logar(dona);
    const romId = await enviarRom(
      cookie,
      romDeSnes({ marcador: new Uint8Array(randomBytes(32)) }),
      'save.sfc',
    );

    // Antes de qualquer save, nenhuma das duas está na lista.
    const antes = await listarConquistas(cookie);
    expect(codigos(antes)).not.toContain('primeira_sincronizacao');
    expect(codigos(antes)).not.toContain('primeiro_save_state');

    await gravarSram(cookie, romId, 0);
    const depoisDaSram = await listarConquistas(cookie);
    expect(codigos(depoisDaSram)).toContain('primeira_sincronizacao');
    expect(codigos(depoisDaSram)).not.toContain('primeiro_save_state');

    await gravarSaveState(cookie, romId);
    const depoisDoSaveState = await listarConquistas(cookie);
    expect(codigos(depoisDoSaveState)).toContain('primeira_sincronizacao');
    expect(codigos(depoisDoSaveState)).toContain('primeiro_save_state');

    // Gravar de novo (revisão 1, a que a primeira gravação deixou) não
    // duplica a conquista já desbloqueada.
    await gravarSram(cookie, romId, 1);
    expect(
      await prisma.userAchievement.count({
        where: { userId: donaId, code: 'primeira_sincronizacao' },
      }),
    ).toBe(1);
  }, 90_000);
});

describe('conquistas por agregação', () => {
  it('coleção reflete a contagem real de ROMs da conta', async () => {
    const cookie = await logar(dona);

    // Dez linhas de `user_roms` para a conta, direto no banco: o que está
    // sob teste é a LEITURA que `achievements` faz da contagem, não o
    // caminho de upload — dez uploads reais de verdade já são cobertos pela
    // suíte de `upload-de-rom`.
    const sha256sDeMentira = Array.from({ length: 10 }, () => randomBytes(32).toString('hex'));
    await prisma.userRom.createMany({
      data: sha256sDeMentira.map((sha256) => ({
        userId: donaId,
        sha256,
        storageKey: `roms/${sha256}`,
        sizeBytes: 1024,
        fileName: `mentira-${sha256.slice(0, 8)}.sfc`,
      })),
    });

    const resposta = await listarConquistas(cookie);

    expect(codigos(resposta)).toContain('colecionista_bronze');
    expect(codigos(resposta)).not.toContain('colecionista_prata');

    await prisma.userRom.deleteMany({
      where: { userId: donaId, sha256: { in: sha256sDeMentira } },
    });
  }, 60_000);

  it('jogos distintos reflete quantos jogos a conta já jogou, e horas jogadas fica presa em zero (issue #119 pendente)', async () => {
    const cookie = await logar(dona);

    const jogos = await Promise.all(
      Array.from({ length: 5 }, (_, indice) =>
        prisma.game.create({
          data: {
            slug: `zz-teste-conquista-jogos-${randomUUID().slice(0, 8)}-${indice}`,
            title: `Jogo de teste ${indice}`,
            systemId: 'snes',
          },
          select: { id: true },
        }),
      ),
    );
    jogosCriados.push(...jogos.map((jogo) => jogo.id));

    await prisma.userGame.createMany({
      data: jogos.map((jogo) => ({ userId: donaId, gameId: jogo.id })),
    });

    const resposta = await listarConquistas(cookie);

    expect(codigos(resposta)).toContain('explorador_bronze');
    expect(codigos(resposta)).not.toContain('explorador_prata');
    // `totalPlaytimeSeconds` é sempre 0 até a #119 escrever playtime de
    // verdade (ADR 0010) — nenhuma conquista de dedicação pode desbloquear
    // a partir de linhas com playtime zerado.
    expect(codigos(resposta)).not.toContain('dedicacao_bronze');

    await prisma.userGame.deleteMany({
      where: { userId: donaId, gameId: { in: jogos.map((j) => j.id) } },
    });
  }, 60_000);
});
