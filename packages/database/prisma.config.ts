import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { defineConfig, env } from 'prisma/config';

// O .env é único e mora na raiz do monorepo — não replicamos variável por pacote.
loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env'), quiet: true });

/**
 * A partir do Prisma 7 a URL de conexão sai do schema.prisma e vive aqui.
 * O runtime usa driver adapter (ver src/client.ts); esta configuração atende
 * aos comandos de migração e introspecção.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'pnpm exec tsx prisma/seed.ts',
  },
});
