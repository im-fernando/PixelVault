import { describe, expect, it } from 'vitest';
import type { BuscaDeCapaPorNome, CandidatoDeCapa } from '../domain/busca-de-capa-por-nome.js';
import type { GameRepository } from '../domain/game-repository.js';
import type { JogoSemCapa } from '../domain/busca-de-capa.js';
import { buscarCapasCandidatas } from './buscar-capas-candidatas.js';

const SUPER_METROID: JogoSemCapa = { systemId: 'snes', title: 'Super Metroid' };

const CANDIDATOS: CandidatoDeCapa[] = [
  {
    title: 'Super Metroid (Japan, USA) (En,Ja)',
    coverUrl: 'https://thumbnails.libretro.com/x/Named_Boxarts/Super%20Metroid.png',
  },
];

function catalogoFalso(jogo: JogoSemCapa | null): Pick<GameRepository, 'jogoSemCapa'> {
  return { jogoSemCapa: async () => jogo };
}

function buscaFalsa(
  resultado: readonly CandidatoDeCapa[],
  perguntas: { systemId: string; termo: string }[] = [],
): BuscaDeCapaPorNome {
  return async (systemId, termo) => {
    perguntas.push({ systemId, termo });
    return resultado;
  };
}

describe('buscarCapasCandidatas', () => {
  it('devolve os candidatos do provedor para o console do jogo casado', async () => {
    const jogos = catalogoFalso(SUPER_METROID);

    const resultado = await buscarCapasCandidatas(
      { jogos, buscarCandidatas: buscaFalsa(CANDIDATOS) },
      'jogo-1',
      'metroid',
    );

    expect(resultado).toEqual({ tipo: 'candidatas', itens: CANDIDATOS });
  });

  it('pergunta pelo console do jogo, e pelo termo exatamente como veio', async () => {
    const jogos = catalogoFalso(SUPER_METROID);
    const perguntas: { systemId: string; termo: string }[] = [];

    await buscarCapasCandidatas(
      { jogos, buscarCandidatas: buscaFalsa(CANDIDATOS, perguntas) },
      'jogo-1',
      'metroid',
    );

    expect(perguntas).toEqual([{ systemId: 'snes', termo: 'metroid' }]);
  });

  it('devolve lista vazia quando nada casa, sem virar erro', async () => {
    const jogos = catalogoFalso(SUPER_METROID);

    const resultado = await buscarCapasCandidatas(
      { jogos, buscarCandidatas: buscaFalsa([]) },
      'jogo-1',
      'nada a ver',
    );

    expect(resultado).toEqual({ tipo: 'candidatas', itens: [] });
  });

  it('não busca nada quando o jogo já tem capa, é homebrew ou não existe', async () => {
    const jogos = catalogoFalso(null);
    const perguntas: { systemId: string; termo: string }[] = [];

    const resultado = await buscarCapasCandidatas(
      { jogos, buscarCandidatas: buscaFalsa(CANDIDATOS, perguntas) },
      'jogo-1',
      'metroid',
    );

    expect(resultado).toEqual({ tipo: 'semOQueProcurar' });
    expect(perguntas).toEqual([]);
  });
});
