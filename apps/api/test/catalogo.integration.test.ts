import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@pixelvault/database';
import { prismaGameRepository } from '../src/modules/catalog/infrastructure/prisma-game-repository.js';

/**
 * O adaptador de catálogo contra PostgreSQL de verdade.
 *
 * O teste de aplicação (`list-games.test.ts`) implementa a porta à mão e por
 * isso não afirma nada sobre o adaptador: o `where` que o Prisma monta, o
 * `mode: 'insensitive'` da busca, a junção que traz a ROM e — o que mais
 * importa aqui — o filtro que impede uma `storage_key` preenchida por engano
 * num jogo comercial de virar ROM servida ao público (ADR 0006). Nada disso
 * existe fora do banco, e era a única peça da suíte de integração que faltava
 * quando a issue #52 foi escrita.
 *
 * Os jogos são criados por este arquivo e apagados no fim. Depender do seed
 * não serviria: no CI ele não roda, e um teste que só passa depois de
 * `pnpm db:seed` é um teste que quebra na máquina de quem acabou de clonar.
 */

/** Prefixo de tudo que este arquivo cria — é por ele que a limpeza acha. */
const PREFIXO = 'zz-teste-catalogo-';

/** Marcador único por execução: dá para buscar só os jogos deste run. */
const MARCADOR = `${PREFIXO}${randomUUID().slice(0, 8)}`;
const MARCADOR_DA_PAGINA = `${PREFIXO}${randomUUID().slice(0, 8)}`;

/** O `take` do adaptador. Não é configurável: está escrito na consulta. */
const TETO_DA_LISTAGEM = 100;

/** SHA-256 de verdade, único por chamada — a coluna é `@unique` global. */
function sha256Novo(): string {
  return createHash('sha256').update(randomUUID()).digest('hex');
}

const homebrewSnes = {
  slug: `${MARCADOR}-alfa`,
  title: `${MARCADOR} Alfa`,
  systemId: 'snes' as const,
  isHomebrew: true,
};
const homebrewGb = {
  slug: `${MARCADOR}-beta`,
  title: `${MARCADOR} Beta`,
  systemId: 'gb' as const,
  isHomebrew: true,
};
const comercial = {
  slug: `${MARCADOR}-gama`,
  title: `${MARCADOR} Gama`,
  systemId: 'snes' as const,
  isHomebrew: false,
};
const homebrewComDuasRoms = {
  slug: `${MARCADOR}-delta`,
  title: `${MARCADOR} Delta`,
  systemId: 'snes' as const,
  isHomebrew: true,
};

/** As duas ROMs do mesmo homebrew, já na ordem em que o adaptador as vê. */
const primeiroSha = sha256Novo();
const segundoSha = sha256Novo();
const SHA_MENOR = primeiroSha < segundoSha ? primeiroSha : segundoSha;
const SHA_MAIOR = primeiroSha < segundoSha ? segundoSha : primeiroSha;

beforeAll(async () => {
  // `systems` é FK de `games` e é dado de seed. Aqui ele é garantido, não
  // recriado: `update: {}` não toca no que já existe.
  for (const sistema of [
    { id: 'snes' as const, name: 'Super Nintendo', coreSlug: 'snes9x2010' },
    { id: 'gb' as const, name: 'Game Boy', coreSlug: 'gambatte' },
  ]) {
    await prisma.system.upsert({ where: { id: sistema.id }, create: sistema, update: {} });
  }

  await prisma.game.create({
    data: {
      ...homebrewSnes,
      releaseYear: 2019,
      publisher: 'Autoria de teste',
      coverUrl: `/roms/${homebrewSnes.slug}/capa.png`,
      // Sem barra inicial de propósito: é assim que o seed grava, e traduzir
      // isso para um caminho a partir da raiz do site é trabalho do adaptador.
      roms: {
        create: {
          sha256: sha256Novo(),
          storageKey: `roms/${homebrewSnes.slug}/${homebrewSnes.slug}.sfc`,
          sizeBytes: 262_144,
        },
      },
    },
  });

  await prisma.game.create({
    data: {
      ...homebrewGb,
      // Homebrew catalogado cuja ROM ainda não subimos: existe hash conhecido,
      // não existe arquivo nosso para servir.
      roms: { create: { sha256: sha256Novo(), storageKey: null, sizeBytes: null } },
    },
  });

  await prisma.game.create({
    data: {
      ...comercial,
      releaseYear: 1991,
      publisher: 'Editora de teste',
      // `storage_key` preenchida num jogo comercial é dado errado — e é
      // exatamente o dado errado que a ADR 0006 manda não confiar.
      roms: {
        create: {
          sha256: sha256Novo(),
          storageKey: `roms/${comercial.slug}/${comercial.slug}.sfc`,
          sizeBytes: 524_288,
        },
      },
    },
  });

  await prisma.game.create({
    data: {
      ...homebrewComDuasRoms,
      roms: {
        create: [
          { sha256: SHA_MAIOR, storageKey: 'roms/duas/maior.sfc', sizeBytes: 131_072 },
          { sha256: SHA_MENOR, storageKey: 'roms/duas/menor.sfc', sizeBytes: 65_536 },
        ],
      },
    },
  });
}, 60_000);

afterAll(async () => {
  // A cascata de `game_roms` leva as ROMs junto.
  await prisma.game.deleteMany({ where: { slug: { startsWith: PREFIXO } } });
  await prisma.$disconnect();
});

describe('prismaGameRepository.list', () => {
  it('devolve os jogos da busca em ordem de título, e só metadado', async () => {
    const jogos = await prismaGameRepository.list({ search: MARCADOR });

    expect(jogos.map((jogo) => jogo.slug)).toEqual([
      homebrewSnes.slug,
      homebrewGb.slug,
      homebrewComDuasRoms.slug,
      comercial.slug,
    ]);

    // A listagem devolve `Game`, não `GameDetail`: a referência da ROM não
    // pode vazar para a home. Ver o comentário da porta em game-repository.ts.
    const [primeiro] = jogos;
    expect(Object.keys(primeiro ?? {}).sort()).toEqual([
      'coverUrl',
      'id',
      'isHomebrew',
      'publisher',
      'releaseYear',
      'slug',
      'systemId',
      'title',
    ]);
    expect(primeiro).toMatchObject({
      systemId: 'snes',
      title: homebrewSnes.title,
      releaseYear: 2019,
      publisher: 'Autoria de teste',
      coverUrl: `/roms/${homebrewSnes.slug}/capa.png`,
      isHomebrew: true,
    });
  }, 30_000);

  it('busca sem diferenciar maiúscula de minúscula', async () => {
    // `mode: 'insensitive'` é do adaptador; um `LIKE` cru não faria isto.
    const jogos = await prismaGameRepository.list({ search: MARCADOR.toUpperCase() });

    expect(jogos.map((jogo) => jogo.slug)).toContain(homebrewSnes.slug);
    expect(jogos).toHaveLength(4);
  }, 30_000);

  it('filtra por console', async () => {
    const jogos = await prismaGameRepository.list({ search: MARCADOR, systemId: 'gb' });

    expect(jogos.map((jogo) => jogo.slug)).toEqual([homebrewGb.slug]);
  }, 30_000);

  it('filtra por homebrew, deixando o comercial de fora', async () => {
    const jogos = await prismaGameRepository.list({ search: MARCADOR, homebrewOnly: true });

    expect(jogos.map((jogo) => jogo.slug)).not.toContain(comercial.slug);
    expect(jogos.every((jogo) => jogo.isHomebrew)).toBe(true);
    expect(jogos).toHaveLength(3);
  }, 30_000);

  it('combina os filtros em vez de escolher um deles', async () => {
    const jogos = await prismaGameRepository.list({
      search: MARCADOR,
      systemId: 'snes',
      homebrewOnly: true,
    });

    expect(jogos.map((jogo) => jogo.slug)).toEqual([homebrewSnes.slug, homebrewComDuasRoms.slug]);
  }, 30_000);

  it('devolve vazio quando a busca não casa com nada', async () => {
    await expect(prismaGameRepository.list({ search: `${MARCADOR}-inexistente` })).resolves.toEqual(
      [],
    );
  }, 30_000);

  it('corta a listagem no teto da consulta, sem depender de quantos jogos existem', async () => {
    // O teto vive no `take` do adaptador. Sem este teste, alguém o remove e
    // a home passa a arrastar o catálogo inteiro sem nada acusar.
    await prisma.game.createMany({
      data: Array.from({ length: TETO_DA_LISTAGEM + 1 }, (_ignorado, indice) => ({
        slug: `${MARCADOR_DA_PAGINA}-${String(indice).padStart(3, '0')}`,
        title: `${MARCADOR_DA_PAGINA} ${String(indice).padStart(3, '0')}`,
        systemId: 'snes' as const,
      })),
    });

    const jogos = await prismaGameRepository.list({ search: MARCADOR_DA_PAGINA });

    expect(jogos).toHaveLength(TETO_DA_LISTAGEM);
    // E o corte é pelos primeiros da ordem alfabética, não por uma fatia
    // qualquer que o banco tenha devolvido.
    expect(jogos[0]?.title).toBe(`${MARCADOR_DA_PAGINA} 000`);
    expect(jogos.at(-1)?.title).toBe(`${MARCADOR_DA_PAGINA} 099`);
  }, 60_000);
});

describe('prismaGameRepository.findBySlug', () => {
  it('devolve null para slug que não existe', async () => {
    await expect(prismaGameRepository.findBySlug(`${MARCADOR}-nao-existe`)).resolves.toBeNull();
  }, 30_000);

  it('entrega a ROM do homebrew como caminho a partir da raiz do site', async () => {
    const jogo = await prismaGameRepository.findBySlug(homebrewSnes.slug);

    expect(jogo).toMatchObject({
      slug: homebrewSnes.slug,
      isHomebrew: true,
      homebrewRom: {
        // A `storage_key` foi gravada sem barra inicial; sem a barra, o
        // caminho resolveria contra a rota atual do front e quebraria dentro
        // do player.
        url: `/roms/${homebrewSnes.slug}/${homebrewSnes.slug}.sfc`,
        fileName: `${homebrewSnes.slug}.sfc`,
        sizeBytes: 262_144,
      },
    });
    expect(jogo?.homebrewRom?.sha256).toMatch(/^[0-9a-f]{64}$/);
  }, 30_000);

  it('não devolve ROM de jogo comercial, nem com a storage_key preenchida', async () => {
    // A garantia central da ADR 0006, e a razão de o filtro do adaptador
    // olhar `game.isHomebrew` em vez de confiar só na coluna: dado errado no
    // banco não pode virar ROM comercial servida ao público.
    const jogo = await prismaGameRepository.findBySlug(comercial.slug);

    expect(jogo).not.toBeNull();
    expect(jogo?.isHomebrew).toBe(false);
    expect(jogo?.homebrewRom).toBeNull();

    // E a linha está lá, com a chave preenchida: o teste não passa por falta
    // de dado, passa porque o adaptador a recusa.
    const rom = await prisma.gameRom.findFirstOrThrow({
      where: { game: { slug: comercial.slug } },
    });
    expect(rom.storageKey).not.toBeNull();
  }, 30_000);

  it('devolve homebrew sem arquivo nosso com a ROM nula, e não com um caminho quebrado', async () => {
    const jogo = await prismaGameRepository.findBySlug(homebrewGb.slug);

    expect(jogo).toMatchObject({ slug: homebrewGb.slug, isHomebrew: true, homebrewRom: null });
  }, 30_000);

  it('escolhe uma ROM só, sempre a mesma, quando o jogo tem mais de uma', async () => {
    // Ordem estável pelo sha256: sem ela, dois deploys serviriam arquivos
    // diferentes para o mesmo slug e o save state do usuário deixaria de
    // casar com a ROM.
    const jogo = await prismaGameRepository.findBySlug(homebrewComDuasRoms.slug);

    expect(jogo?.homebrewRom?.sha256).toBe(SHA_MENOR);
    expect(jogo?.homebrewRom?.fileName).toBe('menor.sfc');
    expect(SHA_MENOR < SHA_MAIOR).toBe(true);
  }, 30_000);
});
