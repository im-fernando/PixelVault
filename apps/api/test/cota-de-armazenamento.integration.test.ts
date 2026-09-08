import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '@pixelvault/database';
import {
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
} from '@pixelvault/contracts';
import { buildApp } from '../src/app.js';
import { NOME_DO_COOKIE_DE_SESSAO } from '../src/modules/sessions/index.js';
import { configDeTeste } from './suporte/ambiente.js';
import { rastroDeTeste } from './suporte/rastro.js';

/**
 * A cota de armazenamento da #76, contra PostgreSQL de verdade.
 *
 * Sem MinIO, e não por economia: o que está sob teste é justamente uma recusa
 * que acontece **antes** de qualquer coisa tocar o storage. A soma é uma
 * agregação SQL sobre `user_roms`, e por isso o banco é de verdade — um
 * repositório falso responderia o número que o autor dele quisesse, e é o
 * número que decide tudo aqui.
 *
 * A biblioteca de cada conta é montada escrevendo em `user_roms` direto: para
 * chegar aos 4 GiB pelo fluxo de upload seriam sessenta e quatro arquivos de
 * 64 MiB subindo de verdade, e o que a cota olha é a soma da tabela, não o
 * caminho por onde ela foi parar lá. As linhas não têm objeto no bucket, e não
 * precisam ter: nada neste arquivo lê ROM.
 *
 * Que a porta de storage fica intocada na recusa é afirmado onde dá para
 * afirmar com clareza — em `solicitar-envio-de-rom.test.ts`, com um
 * armazenamento falso que grita se for chamado. Aqui a afirmação equivalente é
 * a que o cliente enxerga: a resposta não traz URL nenhuma.
 */
const SENHA = 'cavalo-bateria-grampo';

/** Todo request deste arquivo sai deste IP. Ver o cabeçalho de sessoes.integration.test.ts. */
const IP_DO_ARQUIVO = '198.51.100.76';

const MIB = 1024 * 1024;

const rastro = rastroDeTeste(IP_DO_ARQUIVO);

const contaLivre = rastro.identidadeNova('cota-livre');
const contaQuaseCheia = rastro.identidadeNova('cota-quase');
const contaCheia = rastro.identidadeNova('cota-cheia');
const contaComMuitosArquivos = rastro.identidadeNova('cota-muitas');

let app: FastifyInstance;

type RespostaInjetada = Awaited<ReturnType<FastifyInstance['inject']>>;

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

async function pedirUpload(cookie: string, sizeBytes: number): Promise<RespostaInjetada> {
  return app.inject({
    method: 'POST',
    url: '/api/library/uploads',
    payload: { sizeBytes },
    remoteAddress: IP_DO_ARQUIVO,
    cookies: { [NOME_DO_COOKIE_DE_SESSAO]: cookie },
  });
}

/**
 * Enche a biblioteca de alguém até um total exato, com linhas que só existem
 * no banco. Cada `sha256` é único porque `@@unique([userId, sha256])` é o que
 * impede a mesma ROM de contar duas vezes na cota.
 */
async function encherBiblioteca(userId: string, tamanhos: number[]): Promise<void> {
  await prisma.userRom.createMany({
    data: tamanhos.map((sizeBytes, indice) => {
      const sha256 = createHash('sha256').update(`${userId}-${indice}`).digest('hex');
      return {
        userId,
        sha256,
        storageKey: `roms/${sha256}`,
        sizeBytes,
        fileName: `rom-${indice}.sfc`,
      };
    }),
  });
}

/** `n` arquivos de `tamanho` bytes. Só para escrever a soma de forma legível. */
function arquivosDe(n: number, tamanho: number): number[] {
  return Array.from({ length: n }, () => tamanho);
}

let livreId: string;

beforeAll(async () => {
  await rastro.limparContador();

  const criador = await buildApp(configDeTeste);
  livreId = await criarConta(criador, contaLivre);
  const quaseCheiaId = await criarConta(criador, contaQuaseCheia);
  const cheiaId = await criarConta(criador, contaCheia);
  const muitosArquivosId = await criarConta(criador, contaComMuitosArquivos);
  await criador.close();

  // Exatamente na cota: 64 arquivos de 64 MiB somam os 4 GiB. Nem um byte
  // sobra, e é isso que a conta "cheia" precisa ser para o teste significar
  // alguma coisa.
  await encherBiblioteca(cheiaId, arquivosDe(64, 64 * MIB));
  // Um mebibyte livre, e nada além disso.
  await encherBiblioteca(quaseCheiaId, [...arquivosDe(63, 64 * MIB), 63 * MIB]);
  // No teto de arquivos com quase nenhum byte: o eixo que a soma não cobre.
  await encherBiblioteca(muitosArquivosId, arquivosDe(COTA_DE_ROMS_POR_CONTA, 192));
}, 120_000);

beforeEach(async () => {
  app = await buildApp(configDeTeste);
  await rastro.limparContador();
  return async () => {
    await app.close();
  };
});

afterAll(async () => {
  // As linhas de `user_roms` caem por cascata com os usuários.
  await rastro.limpar();
});

describe('POST /api/library/uploads, contra a cota', () => {
  it('autoriza normalmente quem tem espaço', async () => {
    const cookie = await logar(contaLivre);

    const resposta = await pedirUpload(cookie, TAMANHO_MAXIMO_DE_ROM_EM_BYTES);

    expect(resposta.statusCode).toBe(200);
    expect(resposta.json()).toMatchObject({ status: 'envio-autorizado' });
    expect(resposta.json<Record<string, unknown>>()['url']).toBeDefined();
    // A soma da biblioteca é o que a cota olha, e ela não anda por assinar
    // URL: quem faz a biblioteca crescer é a conclusão do envio (#72).
    expect(await prisma.userRom.count({ where: { userId: livreId } })).toBe(0);
  }, 60_000);

  it('recusa a biblioteca cheia sem devolver URL assinada nenhuma', async () => {
    const cookie = await logar(contaCheia);

    const resposta = await pedirUpload(cookie, 1);

    expect(resposta.statusCode).toBe(409);
    const corpo = resposta.json<Record<string, unknown>>();
    expect(corpo).toMatchObject({ code: 'CONFLICT', details: { cota: ['LIMITE_DE_BYTES'] } });
    // O critério de aceite da #76: nenhuma assinatura foi gasta. Não basta ter
    // vindo erro — o que não pode existir é URL.
    expect(corpo['url']).toBeUndefined();
    expect(corpo['uploadId']).toBeUndefined();
    // E a mensagem diz o que fazer, porque é ela que o front mostra enquanto
    // a tela de biblioteca (#74) não existe.
    expect(String(corpo['message'])).toMatch(/Remova alguma ROM/);
  }, 60_000);

  it('recusa o arquivo que estouraria a cota, e autoriza o que ainda cabe', async () => {
    const cookie = await logar(contaQuaseCheia);

    const naoCabe = await pedirUpload(cookie, MIB + 1);
    expect(naoCabe.statusCode).toBe(409);
    expect(naoCabe.json<Record<string, unknown>>()['url']).toBeUndefined();

    // O mebibyte que sobrou continua sendo dela, e fecha a cota exatamente —
    // a fronteira é inclusiva.
    const cabe = await pedirUpload(cookie, MIB);
    expect(cabe.statusCode).toBe(200);
    expect(cabe.json()).toMatchObject({ status: 'envio-autorizado' });
  }, 60_000);

  it('recusa por quantidade quem tem gigabytes livres e arquivo demais', async () => {
    const cookie = await logar(contaComMuitosArquivos);

    const resposta = await pedirUpload(cookie, 192);

    expect(resposta.statusCode).toBe(409);
    expect(resposta.json()).toMatchObject({ details: { cota: ['LIMITE_DE_ARQUIVOS'] } });
    expect(resposta.json<Record<string, unknown>>()['url']).toBeUndefined();
  }, 60_000);

  it('a soma é da biblioteca de quem pediu, e não do acervo inteiro', async () => {
    // As outras contas deste arquivo somam mais de 8 GiB juntas. Se a
    // agregação esquecesse o `where`, ninguém mais enviaria nada.
    const cookie = await logar(contaLivre);
    const sozinha = await prisma.userRom.aggregate({
      where: { userId: livreId },
      _sum: { sizeBytes: true },
    });
    const todas = await prisma.userRom.aggregate({ _sum: { sizeBytes: true } });

    expect(sozinha._sum.sizeBytes ?? 0).toBe(0);
    expect(todas._sum.sizeBytes ?? 0).toBeGreaterThan(COTA_DE_ARMAZENAMENTO_EM_BYTES);
    expect((await pedirUpload(cookie, 4 * MIB)).statusCode).toBe(200);
  }, 60_000);

  it('recusa quem não tem sessão antes de olhar cota nenhuma', async () => {
    const resposta = await app.inject({
      method: 'POST',
      url: '/api/library/uploads',
      payload: { sizeBytes: MIB },
      remoteAddress: IP_DO_ARQUIVO,
    });

    expect(resposta.statusCode).toBe(401);
  });
});

describe('a soma que sustenta a cota', () => {
  it('passa dos 2 GiB sem perder precisão', async () => {
    // `size_bytes` é `Int`, e a soma de 64 linhas de 64 MiB estoura o inteiro
    // de 32 bits: 4 GiB. O `SUM` do PostgreSQL devolve `bigint`, e o que
    // chega aqui precisa continuar sendo o número certo — se ele voltasse
    // truncado ou como texto, a cota liberaria upload de quem já está no teto.
    const cheiaId = (await prisma.user.findUniqueOrThrow({ where: { email: contaCheia.email } }))
      .id;

    const soma = await prisma.userRom.aggregate({
      where: { userId: cheiaId },
      _sum: { sizeBytes: true },
      _count: { _all: true },
    });

    expect(soma._sum.sizeBytes).toBe(COTA_DE_ARMAZENAMENTO_EM_BYTES);
    expect(soma._count._all).toBe(64);
    expect(typeof soma._sum.sizeBytes).toBe('number');
  }, 60_000);

  it('conta cada envio de uma vez só, mesmo com o conteúdo repetido', async () => {
    // O dedupe da ADR 0013 é do objeto no bucket, não da cota: a linha é uma
    // por pessoa, e é a linha que a soma vê. Reenviar o mesmo conteúdo não faz
    // a biblioteca crescer porque `@@unique([userId, sha256])` não deixa.
    const sha256 = createHash('sha256').update(randomUUID()).digest('hex');
    const linha = {
      userId: livreId,
      sha256,
      storageKey: `roms/${sha256}`,
      sizeBytes: 8 * MIB,
      fileName: 'repetida.sfc',
    };
    await prisma.userRom.create({ data: linha });
    await prisma.userRom.createMany({ data: [linha], skipDuplicates: true });

    const soma = await prisma.userRom.aggregate({
      where: { userId: livreId },
      _sum: { sizeBytes: true },
    });
    expect(soma._sum.sizeBytes).toBe(8 * MIB);

    await prisma.userRom.deleteMany({ where: { userId: livreId } });
  }, 60_000);
});
