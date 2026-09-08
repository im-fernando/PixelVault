import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { connect } from 'node:net';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { prisma } from '@pixelvault/database';
import { RAIZ_DO_MONOREPO } from './ambiente.js';

/**
 * O banco da suíte de integração: garantido de pé, migrado e — quando fomos
 * nós que o subimos — derrubado no fim.
 *
 * É o `globalSetup` do Vitest da API, e existe para que `pnpm test` funcione
 * numa máquina limpa, sem passo manual antes. A ordem é a mesma que uma
 * pessoa seguiria:
 *
 * 1. o banco da `DATABASE_URL` já responde? então não mexemos em nada — é o
 *    caso do `docker compose up -d` que ficou aberto na máquina de quem
 *    desenvolve, e o do serviço `postgres` do job do CI;
 * 2. não responde, e o endereço é local? subimos o serviço `postgres` do
 *    `docker-compose.yml` e esperamos ele aceitar consulta;
 * 3. migrations pendentes são aplicadas, e só então a suíte começa.
 *
 * Por que o compose e não Testcontainers: ver docs/adr/0022.
 */

const executar = promisify(execFile);

/** Endereços em que faz sentido tentar subir o compose deste repositório. */
const HOSTS_LOCAIS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0']);

const ESPERA_MAXIMA_MS = 90_000;
const INTERVALO_DE_TENTATIVA_MS = 500;
const TIMEOUT_DA_PORTA_MS = 1_000;

const MIGRATIONS = resolve(RAIZ_DO_MONOREPO, 'packages/database/prisma/migrations');

/** Só subimos o que não estava de pé — e só derrubamos o que subimos. */
let subimosOBanco = false;

function anunciar(mensagem: string): void {
  // eslint-disable-next-line no-console -- é a saída que explica a espera a quem está rodando a suíte
  console.log(`[postgres-de-teste] ${mensagem}`);
}

function enderecoDoBanco(): { host: string; porta: number } | null {
  try {
    const url = new URL(process.env['DATABASE_URL'] ?? '');
    return { host: url.hostname, porta: Number(url.port) || 5432 };
  } catch {
    return null;
  }
}

/**
 * Bate na porta antes de falar com o Prisma.
 *
 * Podia ser só o `select 1`, mas o client loga erro de conexão no console, e
 * o caminho normal desta função é justamente falhar enquanto o container
 * sobe. Um socket que não abre é silencioso e mais rápido.
 */
async function portaAceitaConexao(): Promise<boolean> {
  const endereco = enderecoDoBanco();
  if (endereco === null) return false;

  return new Promise((responder) => {
    const socket = connect({ host: endereco.host, port: endereco.porta });
    const encerrar = (aberta: boolean): void => {
      socket.destroy();
      responder(aberta);
    };
    socket.setTimeout(TIMEOUT_DA_PORTA_MS);
    socket.once('connect', () => encerrar(true));
    socket.once('timeout', () => encerrar(false));
    socket.once('error', () => encerrar(false));
  });
}

/** Porta aberta não é banco pronto: só uma consulta prova isso. */
async function bancoResponde(): Promise<boolean> {
  if (!(await portaAceitaConexao())) return false;
  try {
    await prisma.$queryRawUnsafe('select 1');
    return true;
  } catch {
    return false;
  }
}

async function esperarOBanco(): Promise<boolean> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    if (await bancoResponde()) return true;
    await new Promise((pronto) => setTimeout(pronto, INTERVALO_DE_TENTATIVA_MS));
  }
  return false;
}

async function subirOCompose(url: string): Promise<void> {
  const endereco = enderecoDoBanco();
  if (endereco === null || !HOSTS_LOCAIS.has(endereco.host)) {
    throw new Error(
      `O PostgreSQL de ${url} não respondeu, e o endereço não é local — não há ` +
        'compose para subir. Aponte a DATABASE_URL para um banco acessível.',
    );
  }

  anunciar('banco não respondeu; subindo o serviço `postgres` do docker-compose.yml…');
  try {
    // `--wait` espera o healthcheck do serviço, e não só o container existir:
    // sem ele a suíte começaria a falar com um PostgreSQL ainda inicializando.
    await executar('docker', ['compose', 'up', '-d', '--wait', 'postgres'], {
      cwd: RAIZ_DO_MONOREPO,
    });
  } catch (erro) {
    throw new Error(
      `Não consegui subir o PostgreSQL de teste: ${(erro as Error).message}\n` +
        'A suíte de integração precisa de banco de verdade. Instale o Docker ou ' +
        'suba um PostgreSQL você mesmo e aponte a DATABASE_URL para ele.',
      { cause: erro },
    );
  }
  subimosOBanco = true;
}

/** Os nomes das migrations que existem no repositório. */
async function migrationsDoRepositorio(): Promise<string[]> {
  const entradas = await readdir(MIGRATIONS, { withFileTypes: true });
  return entradas.filter((entrada) => entrada.isDirectory()).map((entrada) => entrada.name);
}

/** As que o banco já registra como concluídas. Banco virgem devolve nada. */
async function migrationsAplicadas(): Promise<string[]> {
  // `to_regclass` devolve nulo em vez de estourar quando a tabela não existe,
  // e banco virgem é caso normal aqui — não erro para o client logar.
  const [tabela] = await prisma.$queryRawUnsafe<{ existe: string | null }[]>(
    `select to_regclass('public._prisma_migrations')::text as existe`,
  );
  if (tabela?.existe === null || tabela === undefined) return [];

  const linhas = await prisma.$queryRawUnsafe<{ migration_name: string }[]>(
    'select migration_name from "_prisma_migrations" where finished_at is not null',
  );
  return linhas.map((linha) => linha.migration_name);
}

/**
 * Aplica migrations só quando falta alguma.
 *
 * Chamar `prisma migrate deploy` a cada execução custaria alguns segundos de
 * CLI para, quase sempre, não fazer nada — e suíte que ninguém roda porque
 * demora é exatamente o que a issue #52 pede para evitar. Comparar os nomes é
 * uma consulta.
 */
async function garantirMigrations(): Promise<void> {
  const aplicadas = new Set(await migrationsAplicadas());
  const pendentes = (await migrationsDoRepositorio()).filter((nome) => !aplicadas.has(nome));
  if (pendentes.length === 0) return;

  anunciar(`aplicando ${pendentes.length} migration(s) pendente(s)…`);
  await executar(
    'pnpm',
    ['--filter', '@pixelvault/database', 'exec', 'prisma', 'migrate', 'deploy'],
    { cwd: RAIZ_DO_MONOREPO, env: process.env },
  );
}

export async function setup(): Promise<void> {
  const url = process.env['DATABASE_URL'] ?? '';

  if (!(await portaAceitaConexao())) await subirOCompose(url);

  if (!(await esperarOBanco())) {
    throw new Error(
      `O PostgreSQL de ${url} não aceitou consulta em ${ESPERA_MAXIMA_MS / 1000}s. ` +
        'Confira se a DATABASE_URL aponta para o serviço `postgres` do ' +
        'docker-compose.yml (porta 5437) e veja `docker compose logs postgres`.',
    );
  }

  await garantirMigrations();
  await prisma.$disconnect();
}

export async function teardown(): Promise<void> {
  await prisma.$disconnect();
  if (!subimosOBanco) return;

  // `stop` e não `down`: o container volta na próxima execução sem recriar
  // nada, e o volume de quem desenvolve continua intacto. O que derrubamos é
  // o que nós levantamos, e só isso.
  anunciar('derrubando o PostgreSQL que esta execução subiu…');
  await executar('docker', ['compose', 'stop', 'postgres'], { cwd: RAIZ_DO_MONOREPO });
}
