import { PrismaPg } from '@prisma/adapter-pg';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { PrismaClient, SystemId } from '../generated/client/client.js';

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../.env'), quiet: true });

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env['DATABASE_URL']! }),
});

/**
 * Seed idempotente: pode rodar quantas vezes quiser.
 *
 * Só entra aqui conteúdo que podemos distribuir — sistemas, metadados e
 * homebrew. Nenhuma ROM comercial. Ver docs/adr/0006.
 */
async function main(): Promise<void> {
  await prisma.system.createMany({
    data: [
      { id: SystemId.snes, name: 'Super Nintendo', coreSlug: 'snes9x' },
      { id: SystemId.nes, name: 'Nintendo Entertainment System', coreSlug: 'fceumm' },
      { id: SystemId.gb, name: 'Game Boy', coreSlug: 'gambatte' },
      { id: SystemId.gba, name: 'Game Boy Advance', coreSlug: 'mgba' },
      { id: SystemId.genesis, name: 'Mega Drive', coreSlug: 'genesis_plus_gx' },
    ],
    skipDuplicates: true,
  });

  // O catálogo de homebrew de verdade entra na M1 (issue #24), junto com os
  // arquivos e a checagem de licença de cada título.
  console.warn('seed: sistemas registrados. Catálogo de homebrew vem na M1.');
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
