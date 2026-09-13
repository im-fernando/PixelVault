import { describe, expect, it } from 'vitest';
import type { BuscaDeCapa, JogoSemCapa } from '../domain/busca-de-capa.js';
import type { GameRepository } from '../domain/game-repository.js';
import { identificarCapaManual } from './identificar-capa-manual.js';

/**
 * O caso de uso sem banco e sem rede, mesmo desenho de
 * `garantir-capa-do-jogo.test.ts` — a diferença entre os dois está só no
 * título que chega à busca: aqui é o que a pessoa digitou, não o do catálogo.
 */
const SUPER_METROID: JogoSemCapa = { systemId: 'snes', title: 'Super Metroid' };

const CAPA =
  'https://thumbnails.libretro.com/x/Named_Boxarts/Super%20Metroid%20(Japan%2C%20USA)%20(En%2CJa).png';

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

describe('identificarCapaManual', () => {
  it('grava a capa quando o nome digitado bate com o provedor', async () => {
    const { jogos, gravadas } = catalogoFalso(SUPER_METROID);

    const resultado = await identificarCapaManual(
      { jogos, busca: buscaFalsa(CAPA) },
      'jogo-1',
      'Super Metroid (Japan, USA) (En,Ja)',
    );

    expect(resultado).toEqual({ tipo: 'encontrada', coverUrl: CAPA });
    expect(gravadas).toEqual([{ gameId: 'jogo-1', coverUrl: CAPA }]);
  });

  it('pergunta pelo título DIGITADO, não pelo título do catálogo', async () => {
    const { jogos } = catalogoFalso(SUPER_METROID);
    const perguntas: JogoSemCapa[] = [];

    await identificarCapaManual(
      { jogos, busca: buscaFalsa(CAPA, perguntas) },
      'jogo-1',
      'Super Metroid (Japan, USA) (En,Ja)',
    );

    // O console vem do catálogo — só o nome é o que a pessoa escreveu.
    expect(perguntas).toEqual([{ systemId: 'snes', title: 'Super Metroid (Japan, USA) (En,Ja)' }]);
  });

  it('devolve "naoEncontrada" quando o nome digitado também não bate com nada — sem gravar', async () => {
    const { jogos, gravadas } = catalogoFalso(SUPER_METROID);

    const resultado = await identificarCapaManual(
      { jogos, busca: buscaFalsa(null) },
      'jogo-1',
      'nome que não existe em canto nenhum',
    );

    expect(resultado).toEqual({ tipo: 'naoEncontrada' });
    expect(gravadas).toEqual([]);
  });

  it('devolve "semOQueProcurar" quando o jogo já tem capa, é homebrew ou não existe', async () => {
    // As três respostas do catálogo chegam aqui como o mesmo `null` — quem
    // decide isso é o `where` do adaptador, não este caso de uso.
    const { jogos, gravadas } = catalogoFalso(null);
    const perguntas: JogoSemCapa[] = [];

    const resultado = await identificarCapaManual(
      { jogos, busca: buscaFalsa(CAPA, perguntas) },
      'jogo-1',
      'qualquer nome',
    );

    expect(resultado).toEqual({ tipo: 'semOQueProcurar' });
    expect(perguntas).toEqual([]);
    expect(gravadas).toEqual([]);
  });
});
