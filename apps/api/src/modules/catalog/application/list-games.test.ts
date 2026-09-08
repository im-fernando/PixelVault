import { describe, expect, it } from 'vitest';
import type { GameDetail, GameListQuery } from '@pixelvault/contracts';
import type { GameRepository } from '../domain/game-repository.js';
import { getGameBySlug } from './get-game.js';
import { listGames } from './list-games.js';

/**
 * Teste de aplicação sem banco e sem mock de biblioteca: a porta é uma
 * interface, então implementá-la à mão é mais barato e mais legível do que
 * qualquer framework de mock. É exatamente para isso que a porta existe.
 */
function repositorioFalso(jogos: GameDetail[]): GameRepository {
  return {
    list: async (query: GameListQuery) =>
      jogos.filter((j) => (query.systemId ? j.systemId === query.systemId : true)),
    findBySlug: async (slug: string) => jogos.find((j) => j.slug === slug) ?? null,
    // Não é o assunto destes testes: quem exercita o match de hash é o
    // adaptador, contra banco de verdade (`catalogo.integration.test.ts`).
    identificarRomPorHash: async () => null,
  };
}

const zelda: GameDetail = {
  id: '00000000-0000-4000-8000-000000000001',
  systemId: 'snes',
  title: 'A Link to the Past',
  slug: 'a-link-to-the-past',
  releaseYear: 1991,
  publisher: 'Nintendo',
  coverUrl: null,
  isHomebrew: false,
  homebrewRom: null,
};

const tetris: GameDetail = {
  ...zelda,
  id: '00000000-0000-4000-8000-000000000002',
  systemId: 'gb',
  slug: 'tetris',
  title: 'Tetris',
};

describe('listGames', () => {
  it('devolve tudo quando não há filtro', async () => {
    const jogos = await listGames(repositorioFalso([zelda, tetris]), {
      limit: 20,
    } as GameListQuery);
    expect(jogos).toHaveLength(2);
  });

  it('filtra por console', async () => {
    const jogos = await listGames(repositorioFalso([zelda, tetris]), {
      systemId: 'gb',
    } as GameListQuery);
    expect(jogos.map((j) => j.slug)).toEqual(['tetris']);
  });
});

describe('getGameBySlug', () => {
  it('devolve o jogo quando existe', async () => {
    await expect(getGameBySlug(repositorioFalso([zelda]), 'a-link-to-the-past')).resolves.toEqual(
      zelda,
    );
  });

  it('devolve a referência da ROM do homebrew — é o que o player precisa do slug', async () => {
    const homebrew: GameDetail = {
      ...zelda,
      slug: 'sure-instinct',
      isHomebrew: true,
      homebrewRom: {
        url: '/roms/sure-instinct/sure-instinct.sfc',
        fileName: 'sure-instinct.sfc',
        sha256: '73390b30a441ecc8042038f959b34e981ed8b5a0d9053b4d94d1dcd968a0f0ef',
        sizeBytes: 524288,
      },
    };

    await expect(
      getGameBySlug(repositorioFalso([homebrew]), 'sure-instinct'),
    ).resolves.toMatchObject({ homebrewRom: { fileName: 'sure-instinct.sfc' } });
  });

  it('estoura NOT_FOUND quando não existe', async () => {
    await expect(getGameBySlug(repositorioFalso([]), 'inexistente')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
