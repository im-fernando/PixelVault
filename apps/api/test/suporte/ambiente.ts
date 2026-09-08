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

loadEnv({ path: resolve(RAIZ_DO_MONOREPO, '.env'), quiet: true });

process.env['DATABASE_URL'] ??= DATABASE_URL_PADRAO;
process.env['SESSION_SECRET'] ??= SESSION_SECRET_PADRAO;

/**
 * A configuração que todo arquivo de integração usa. `NODE_ENV=test` não é
 * detalhe: é ele que escolhe o transporte `console` de e-mail (ver
 * `config.ts`) e o cookie `Secure`.
 */
export const configDeTeste: Config = loadConfig({ ...process.env, NODE_ENV: 'test' });
