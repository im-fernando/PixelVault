import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

/**
 * Cliente único do processo.
 *
 * O Prisma 7 exige driver adapter — o `pg` é quem realmente fala com o
 * PostgreSQL. Em desenvolvimento o client é guardado no globalThis para
 * sobreviver ao hot reload sem abrir um pool novo a cada troca de arquivo.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error(
      'DATABASE_URL não definida. Copie .env.example para .env e suba o banco com `docker compose up -d`.',
    );
  }

  return new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? createClient();

if (process.env['NODE_ENV'] === 'development') {
  globalForPrisma.prisma = prisma;
}
