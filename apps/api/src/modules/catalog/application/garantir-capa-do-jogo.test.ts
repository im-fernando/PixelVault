import { describe, expect, it } from 'vitest';
import type { BuscaDeCapa, JogoSemCapa } from '../domain/busca-de-capa.js';
import type { GameRepository } from '../domain/game-repository.js';
import { garantirCapaDoJogo } from './garantir-capa-do-jogo.js';

/**
 * O caso de uso sem banco e sem rede: as duas portas são interfaces, e
 * implementá-las à mão é mais barato e mais legível do que qualquer framework
 * de mock — o mesmo que `list-games.test.ts` faz com o repositório.
 */
const CHRONO: JogoSemCapa = { systemId: 'snes', title: 'Chrono Trigger' };

const CAPA = 'https://thumbnails.libretro.com/x/Named_Boxarts/Chrono%20Trigger%20(USA).png';

type Gravacao = { gameId: string; coverUrl: string };

function catalogoFalso(jogo: JogoSemCapa | null, gravadas: Gravacao[] = []) {
  const jogos: Pick<GameRepository, 'jogoSemCapa' | 'definirCapa'> = {
    jogoSemCapa: async () => jogo,
    definirCapa: async (gameId, coverUrl) => {
      gravadas.push({ gameId, coverUrl });
    },
  };
  return { jogos, gravadas };
}

function buscaFalsa(resultado: string | null, chamadas: JogoSemCapa[] = []): BuscaDeCapa {
  return {
    buscar: async (jogo) => {
      chamadas.push(jogo);
      return resultado;
    },
  };
}

describe('garantirCapaDoJogo', () => {
  it('grava a capa quando o provedor tem uma', async () => {
    const { jogos, gravadas } = catalogoFalso(CHRONO);

    const capa = await garantirCapaDoJogo({ jogos, busca: buscaFalsa(CAPA) }, 'jogo-1');

    expect(capa).toBe(CAPA);
    expect(gravadas).toEqual([{ gameId: 'jogo-1', coverUrl: CAPA }]);
  });

  it('pergunta pelo título e pelo console do jogo casado', async () => {
    const { jogos } = catalogoFalso(CHRONO);
    const perguntas: JogoSemCapa[] = [];

    await garantirCapaDoJogo({ jogos, busca: buscaFalsa(CAPA, perguntas) }, 'jogo-1');

    expect(perguntas).toEqual([CHRONO]);
  });

  it('segue sem capa quando o provedor não tem o jogo — e não grava nada', async () => {
    const { jogos, gravadas } = catalogoFalso(CHRONO);

    const capa = await garantirCapaDoJogo({ jogos, busca: buscaFalsa(null) }, 'jogo-1');

    expect(capa).toBeNull();
    expect(gravadas).toEqual([]);
  });

  it('não procura nada quando o catálogo diz que não há o que procurar', async () => {
    // Jogo que já tem capa, homebrew e jogo inexistente chegam aqui como o
    // mesmo `null` — quem decide isso é o `where` do adaptador.
    const { jogos, gravadas } = catalogoFalso(null);
    const perguntas: JogoSemCapa[] = [];

    const capa = await garantirCapaDoJogo({ jogos, busca: buscaFalsa(CAPA, perguntas) }, 'jogo-1');

    expect(capa).toBeNull();
    expect(perguntas).toEqual([]);
    expect(gravadas).toEqual([]);
  });
});
