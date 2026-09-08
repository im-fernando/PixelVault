import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { loadConfig, type Config } from '../../src/config.js';

/**
 * Ambiente de teste da API, num lugar só.
 *
 * Este arquivo é `setupFiles` no `vitest.config.ts`, e por isso roda **antes**
 * de qualquer import do arquivo de teste — inclusive antes do
 * `@pixelvault/database`, que lê a `DATABASE_URL` no primeiro uso do client.
 * Era este preâmbulo que cada arquivo de teste repetia no topo, e ele só
 * funcionava ali por causa do Proxy preguiçoso do client.
 */

/** Raiz do monorepo. O `.env` é único e mora lá — não há `.env` por pacote. */
export const RAIZ_DO_MONOREPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

/**
 * O mesmo banco do serviço `postgres` do `docker-compose.yml`.
 *
 * Existe como padrão para que `pnpm test` funcione numa máquina limpa, sem
 * `.env` nenhum: quem acabou de clonar o repositório roda a suíte e o
 * `globalSetup` sobe esse serviço sozinho. Quem tem `.env` continua mandando —
 * `dotenv` não sobrescreve o ambiente, e este valor só entra se ninguém
 * definiu nada.
 */
export const DATABASE_URL_PADRAO =
  'postgresql://pixelvault:pixelvault@localhost:5437/pixelvault?schema=public';

/**
 * Segredo de teste. Não protege nada, e não precisa: o que ele faz na suíte é
 * derivar as chaves HMAC de `auth_attempts`, que os testes recalculam.
 */
const SESSION_SECRET_PADRAO = 'segredo-de-teste-que-nao-protege-nada-mas-passa-na-validacao';

/**
 * O mesmo MinIO do serviço `minio` do `docker-compose.yml`, com o bucket que o
 * `minio-init` cria. Pelo mesmo motivo da `DATABASE_URL`: quem clonou o
 * repositório roda `pnpm test` e o `globalSetup` sobe o serviço sozinho (ver
 * `minio-de-teste.ts`).
 *
 * A suíte compartilha o bucket de desenvolvimento, e isso obriga à mesma
 * disciplina que o banco impõe (docs/adr/0022): cada arquivo escreve sob um
 * prefixo só dele e apaga o que criou. Nada de listar o bucket e limpar.
 */
const STORAGE_PADRAO: Record<string, string> = {
  S3_ENDPOINT: 'http://localhost:9000',
  S3_REGION: 'us-east-1',
  S3_BUCKET: 'pixelvault-dev',
  S3_ACCESS_KEY_ID: 'pixelvault',
  S3_SECRET_ACCESS_KEY: 'pixelvault',
  S3_FORCE_PATH_STYLE: 'true',
};

loadEnv({ path: resolve(RAIZ_DO_MONOREPO, '.env'), quiet: true });

process.env['DATABASE_URL'] ??= DATABASE_URL_PADRAO;
process.env['SESSION_SECRET'] ??= SESSION_SECRET_PADRAO;
for (const [variavel, padrao] of Object.entries(STORAGE_PADRAO)) {
  process.env[variavel] ??= padrao;
}

/**
 * A configuração que todo arquivo de integração usa. `NODE_ENV=test` não é
 * detalhe: é ele que escolhe o transporte `console` de e-mail (ver
 * `config.ts`) e o cookie `Secure`.
 */
export const configDeTeste: Config = loadConfig({ ...process.env, NODE_ENV: 'test' });
