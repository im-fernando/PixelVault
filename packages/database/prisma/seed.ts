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
 * Caminho das capas a partir da raiz do site, deliberadamente SEM origem.
 *
 * Os arquivos de homebrew moram em `apps/web/public/roms/`, então quem os
 * serve é o próprio front.
 *
 * Gravar `http://localhost:5173/...` na linha do banco faria as capas
 * quebrarem ao trocar de domínio, e o seed não teria como corrigir. O caminho
 * relativo resolve contra qualquer domínio que sirva a aplicação.
 */
const CAMINHO_ROMS = '/roms';

type Homebrew = {
  slug: string;
  title: string;
  releaseYear: number;
  /** Autor. É ele quem licencia, então é ele que vai na coluna. */
  publisher: string;
  temCapa: boolean;
  rom: {
    /** Calculado do arquivo em apps/web/public/roms/. Ver docs/homebrew.md. */
    sha256: string;
    sizeBytes: number;
    region: string;
    revision: string | null;
  };
};

/**
 * Catálogo público de homebrew.
 *
 * Só entra título cuja permissão de redistribuição está escrita pelo autor e
 * arquivada em docs/homebrew.md — "é homebrew" não basta. Quem tem licença
 * ambígua fica de fora, e o motivo do descarte também está documentado lá.
 */
const HOMEBREWS: Homebrew[] = [
  {
    slug: 'super-sudoku',
    title: 'Super Sudoku',
    releaseYear: 2019,
    publisher: 'Raphaël Assenat (raphnet)',
    // O projeto não publica arte que possamos redistribuir. Ver docs/homebrew.md.
    temCapa: false,
    rom: {
      sha256: '2810aa0c4d95ed225c3ac0e669575d20285272b69ec0359a52bfb79628fb0939',
      sizeBytes: 262144,
      region: 'NTSC',
      revision: 'v1.1',
    },
  },
  {
    slug: 'castle-platformer',
    title: 'Castle Platformer',
    releaseYear: 2015,
    publisher: 'Marcus Rowe (undisbeliever)',
    temCapa: true,
    rom: {
      sha256: '8b325cbc3b5eee257b906f11b0a0bced2925c503293e9f242ca0492f23804df8',
      sizeBytes: 131072,
      region: 'NTSC',
      revision: 'v1.04',
    },
  },
  {
    // Salva em 8 KB de SRAM de bateria (HiROM, tipo de cartucho $02) e é MIT
    // sem ressalva — por isso é o título de referência do ciclo de save.
    slug: 'sure-instinct',
    title: 'Sure Instinct',
    releaseYear: 2021,
    publisher: 'Benjamin Schulte (BennySnesDev)',
    temCapa: true,
    rom: {
      sha256: '73390b30a441ecc8042038f959b34e981ed8b5a0d9053b4d94d1dcd968a0f0ef',
      sizeBytes: 524288,
      region: 'NTSC',
      revision: 'v1.0.2',
    },
  },
  {
    // Segundo título com SRAM de bateria (2 KB, tipo de cartucho $02). Manter
    // dois é de propósito: este tem cláusula NonCommercial, e o ciclo de save
    // não pode depender de um jogo que uma mudança de modelo de negócio tira
    // do ar. Ver docs/homebrew.md.
    slug: 'euc-thrills',
    title: 'EUC Thrills — SNES Edition',
    releaseYear: 2026,
    publisher: 'Edwin Rodmen (VibezZzCoder)',
    temCapa: true,
    rom: {
      sha256: '076c9d236453ad1363bc5f6ca6f7dc3198fbeb9509982087ba85330c52de8503',
      sizeBytes: 524288,
      region: 'NTSC',
      revision: null,
    },
  },
];

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

  // upsert, e não createMany+skipDuplicates: com skipDuplicates o seed nunca
  // consegue CORRIGIR metadado, só inserir na primeira vez. Metadado de
  // catálogo canônico é exatamente o tipo de coisa que se ajusta depois
  // (capa nova, ano errado, nome do autor).
  for (const jogo of HOMEBREWS) {
    const dados = {
      systemId: SystemId.snes,
      title: jogo.title,
      releaseYear: jogo.releaseYear,
      publisher: jogo.publisher,
      coverUrl: jogo.temCapa ? `${CAMINHO_ROMS}/${jogo.slug}/capa.png` : null,
      isHomebrew: true,
    };

    await prisma.game.upsert({
      where: { slug: jogo.slug },
      create: { ...dados, slug: jogo.slug },
      update: dados,
    });
  }

  // O id do jogo é gerado pelo banco, então o vínculo com a ROM é feito pelo
  // slug — que é único e estável entre execuções.
  const idPorSlug = new Map(
    (
      await prisma.game.findMany({
        where: { slug: { in: HOMEBREWS.map((jogo) => jogo.slug) } },
        select: { id: true, slug: true },
      })
    ).map((jogo) => [jogo.slug, jogo.id]),
  );

  await prisma.gameRom.createMany({
    data: HOMEBREWS.map((jogo) => ({
      gameId: idPorSlug.get(jogo.slug)!,
      sha256: jogo.rom.sha256,
      region: jogo.rom.region,
      revision: jogo.rom.revision,
      // Preenchido porque é homebrew: é o único caso em que servimos o
      // arquivo. Caminho relativo à raiz pública do front. Ver docs/adr/0006.
      storageKey: `roms/${jogo.slug}/${jogo.slug}.sfc`,
      sizeBytes: jogo.rom.sizeBytes,
    })),
    skipDuplicates: true,
  });

  console.warn(`seed: 5 sistemas e ${HOMEBREWS.length} homebrews de SNES no catálogo.`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
