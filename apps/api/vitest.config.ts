import { defineConfig } from 'vitest/config';

/**
 * A suíte da API é a única do monorepo que fala com PostgreSQL de verdade, e
 * é aqui que ela passa a cuidar disso sozinha:
 *
 * - `globalSetup` garante o banco de pé e migrado antes do primeiro arquivo,
 *   subindo o serviço do `docker-compose.yml` se não houver nada respondendo
 *   — e derrubando no fim só o que ele mesmo subiu. Ver docs/adr/0022.
 * - `setupFiles` carrega o `.env` da raiz antes de qualquer import do arquivo
 *   de teste, que é o preâmbulo que todo arquivo de integração repetia.
 */
export default defineConfig({
  test: {
    globalSetup: ['./test/suporte/postgres-de-teste.ts'],
    setupFiles: ['./test/suporte/ambiente.ts'],
  },
});
