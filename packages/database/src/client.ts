import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/client/client.js';

/**
 * Cliente único do processo, criado de forma preguiçosa.
 *
 * O `import` não pode abrir conexão: imports ESM são avaliados antes do corpo
 * do módulo que os importa, então instanciar aqui rodaria antes do dotenv
 * carregar o .env — e antes de um teste ter chance de configurar o ambiente.
 * O Proxy adia a criação para o primeiro uso de verdade.
 *
 * O Prisma 7 exige driver adapter: o `pg` é quem realmente fala com o
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

  const client = new PrismaClient({
    adapter: new PrismaPg({ connectionString }),
    log: process.env['NODE_ENV'] === 'development' ? ['warn', 'error'] : ['error'],
  });

  if (process.env['NODE_ENV'] === 'development') {
    globalForPrisma.prisma = client;
  }

  return client;
}

function resolveClient(): PrismaClient {
  globalForPrisma.prisma ??= createClient();
  return globalForPrisma.prisma;
}

export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_alvo, propriedade) {
    const client = resolveClient();
    const valor = Reflect.get(client, propriedade) as unknown;
    return typeof valor === 'function' ? valor.bind(client) : valor;
  },
});
