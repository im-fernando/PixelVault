import { describe, expect, it } from 'vitest';
import type { JogoSemCapa } from '../domain/busca-de-capa.js';
import { criarBuscaNoLibretroThumbnails, type BuscarHttp } from './capa-libretro-thumbnails.js';

/**
 * O adaptador com o `fetch` trocado por uma função de três linhas.
 *
 * Trocar a rede por uma função é a escolha consciente desta suíte: o que está
 * em teste é a **decisão** do adaptador — qual nome tentar, em que ordem, o
 * que fazer com 404 e quando não perguntar de novo —, e nada disso é sobre o
 * servidor da comunidade libretro estar de pé. Teste que dependesse dele
 * ficaria vermelho por causa da rede de outra pessoa, e ainda gastaria banda
 * de um serviço mantido por voluntários a cada `pnpm test`.
 *
 * A contrapartida é explícita: nenhum teste daqui afirma que a estrutura de
 * pastas do libretro é a que `nomes-no-libretro.ts` descreve. Isso foi
 * conferido contra o servidor de verdade na hora de escrever, e está anotado
 * com as fontes no cabeçalho daquele arquivo.
 */
const BASE = 'https://thumbnails.exemplo';

const CHRONO: JogoSemCapa = { systemId: 'snes', title: 'Chrono Trigger' };

const PASTA = `${BASE}/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts`;
const CAPA_USA = `${PASTA}/Chrono%20Trigger%20(USA).png`;

/** Um `fetch` que só conhece as URLs que lhe deram, e anota tudo que pediram. */
function httpFalso(existentes: readonly string[], pedidas: string[] = []): BuscarHttp {
  return async (url) => {
    pedidas.push(url);
    return { ok: existentes.includes(url) };
  };
}

describe('criarBuscaNoLibretroThumbnails', () => {
  it('devolve a primeira URL que existir', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: httpFalso([CAPA_USA], pedidas),
    });

    await expect(busca.buscar(CHRONO)).resolves.toBe(CAPA_USA);
    // Parou no `(USA)`: o título cru foi tentado antes e não existe, e as
    // demais regiões nem chegaram a ser perguntadas.
    expect(pedidas).toEqual([`${PASTA}/Chrono%20Trigger.png`, CAPA_USA]);
  });

  it('devolve null quando nenhum candidato existe', async () => {
    const busca = criarBuscaNoLibretroThumbnails({ baseUrl: BASE, buscarHttp: httpFalso([]) });

    await expect(busca.buscar(CHRONO)).resolves.toBeNull();
  });

  it('pergunta com HEAD — a resposta que interessa é o status, não a imagem', async () => {
    let metodo = '';
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: async (_url, opcoes) => {
        metodo = opcoes.method;
        return { ok: true };
      },
    });

    await busca.buscar(CHRONO);

    expect(metodo).toBe('HEAD');
  });

  it('não repete a pergunta enquanto o "não tem" está valendo', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: httpFalso([], pedidas),
      agora: () => 0,
    });

    await busca.buscar(CHRONO);
    const perguntasDaPrimeiraVez = pedidas.length;
    await expect(busca.buscar(CHRONO)).resolves.toBeNull();

    expect(pedidas).toHaveLength(perguntasDaPrimeiraVez);
  });

  it('pergunta de novo depois que o TTL vence', async () => {
    const pedidas: string[] = [];
    let relogio = 0;
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: httpFalso([], pedidas),
      ttlDaAusenciaMs: 1_000,
      agora: () => relogio,
    });

    await busca.buscar(CHRONO);
    const perguntasDaPrimeiraVez = pedidas.length;
    relogio = 1_001;
    await busca.buscar(CHRONO);

    expect(pedidas.length).toBe(perguntasDaPrimeiraVez * 2);
  });

  it('não guarda ausência quando a rede falhou — a próxima tentativa tenta de novo', async () => {
    let tentativas = 0;
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: async () => {
        tentativas += 1;
        throw new Error('rede fora');
      },
    });

    // A falha sobe: "não consegui perguntar" não é "esse jogo não tem capa".
    await expect(busca.buscar(CHRONO)).rejects.toThrow('rede fora');
    await expect(busca.buscar(CHRONO)).rejects.toThrow('rede fora');

    expect(tentativas).toBe(2);
  });

  it('trata o cache como do par console + título, sem diferenciar caixa', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaNoLibretroThumbnails({
      baseUrl: BASE,
      buscarHttp: httpFalso([], pedidas),
    });

    await busca.buscar(CHRONO);
    const perguntasDaPrimeiraVez = pedidas.length;

    await busca.buscar({ systemId: 'snes', title: ' chrono trigger ' });
    expect(pedidas).toHaveLength(perguntasDaPrimeiraVez);

    // Outro console é outra pasta, e portanto outra pergunta.
    await busca.buscar({ systemId: 'gba', title: 'Chrono Trigger' });
    expect(pedidas.length).toBeGreaterThan(perguntasDaPrimeiraVez);
  });
});
