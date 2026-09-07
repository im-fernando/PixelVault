import { describe, expect, it } from 'vitest';
import type { Game, GameListQuery } from '@pixelvault/contracts';
import type { GameRepository } from '../domain/game-repository.js';
import { getGameBySlug } from './get-game.js';
import { listGames } from './list-games.js';

/**
 * Teste de aplicação sem banco e sem mock de biblioteca: a porta é uma
 * interface, então implementá-la à mão é mais barato e mais legível do que
 * qualquer framework de mock. É exatamente para isso que a porta existe.
 */
function repositorioFalso(jogos: Game[]): GameRepository {
  return {
    list: async (query: GameListQuery) =>
      jogos.filter((j) => (query.systemId ? j.systemId === query.systemId : true)),
    findBySlug: async (slug: string) => jogos.find((j) => j.slug === slug) ?? null,
  };
}

const zelda: Game = {
  id: '00000000-0000-4000-8000-000000000001',
  systemId: 'snes',
  title: 'A Link to the Past',
  slug: 'a-link-to-the-past',
  releaseYear: 1991,
  publisher: 'Nintendo',
  coverUrl: null,
  isHomebrew: false,
};

const tetris: Game = {
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

  it('estoura NOT_FOUND quando não existe', async () => {
    await expect(getGameBySlug(repositorioFalso([]), 'inexistente')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });
});
