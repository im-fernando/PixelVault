import { describe, expect, it } from 'vitest';
import {
  criarBuscaDeCapaPorNomeNoLibretro,
  type BuscarHttpJson,
} from './capa-libretro-thumbnails-por-nome.js';

/** A árvore de verdade tem milhares de entradas — cinco bastam pra afirmar o filtro e a URL. */
const ARVORE_SNES = {
  truncated: false,
  tree: [
    { path: 'Named_Boxarts/Super Metroid (Europe) (En,Fr,De).png', type: 'blob' },
    { path: 'Named_Boxarts/Super Metroid (Japan, USA) (En,Ja).png', type: 'blob' },
    { path: 'Named_Boxarts/Super Mario World (USA).png', type: 'blob' },
    { path: 'Named_Boxarts/Chrono Trigger (USA).png', type: 'blob' },
    // Não é `Named_Boxarts`, e não pode aparecer em resultado nenhum.
    { path: 'Named_Titles/Super Metroid (USA).png', type: 'blob' },
    // Não é `.png`, mesma razão.
    { path: 'Named_Boxarts/leia-me.txt', type: 'blob' },
    // Diretório — sem extensão de arquivo, filtrado do mesmo jeito.
    { path: 'Named_Boxarts', type: 'tree' },
  ],
};

function httpFalso(corpo: unknown, pedidas: string[] = [], ok = true): BuscarHttpJson {
  return async (url) => {
    pedidas.push(url);
    return { ok, status: ok ? 200 : 500, json: async () => corpo };
  };
}

describe('criarBuscaDeCapaPorNomeNoLibretro', () => {
  it('devolve os candidatos cujo nome contém o termo, sem diferenciar caixa', async () => {
    const busca = criarBuscaDeCapaPorNomeNoLibretro({ buscarHttp: httpFalso(ARVORE_SNES) });

    const candidatos = await busca('snes', 'metroid');

    expect(candidatos.map((c) => c.title)).toEqual([
      'Super Metroid (Europe) (En,Fr,De)',
      'Super Metroid (Japan, USA) (En,Ja)',
    ]);
  });

  it('a URL de cada candidato é a mesma convenção de nome do libretro-thumbnails', async () => {
    const busca = criarBuscaDeCapaPorNomeNoLibretro({ buscarHttp: httpFalso(ARVORE_SNES) });

    const [candidato] = await busca('snes', 'Chrono Trigger');

    expect(candidato).toEqual({
      title: 'Chrono Trigger (USA)',
      coverUrl:
        'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger%20(USA).png',
    });
  });

  it('ignora o que não é capa nomeada — outra pasta, outra extensão, diretório', async () => {
    const busca = criarBuscaDeCapaPorNomeNoLibretro({ buscarHttp: httpFalso(ARVORE_SNES) });

    // "leia-me" e o diretório "Named_Boxarts" nunca aparecem, mesmo pedindo
    // um termo que os conteria por texto.
    await expect(busca('snes', 'leia')).resolves.toEqual([]);
    await expect(busca('snes', 'named_boxarts')).resolves.toEqual([]);
  });

  it('devolve vazio para termo em branco, sem perguntar nada à rede', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso(ARVORE_SNES, pedidas),
    });

    await expect(busca('snes', '   ')).resolves.toEqual([]);
    expect(pedidas).toEqual([]);
  });

  it('busca a árvore uma vez só por sistema — a segunda busca usa o cache', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso(ARVORE_SNES, pedidas),
    });

    await busca('snes', 'super');
    await busca('snes', 'chrono');

    expect(pedidas).toHaveLength(1);
  });

  it('busca de novo depois que o cache vence', async () => {
    let relogio = 0;
    const pedidas: string[] = [];
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso(ARVORE_SNES, pedidas),
      ttlMs: 1_000,
      agora: () => relogio,
    });

    await busca('snes', 'super');
    relogio = 1_001;
    await busca('snes', 'super');

    expect(pedidas).toHaveLength(2);
  });

  it('cada sistema tem seu próprio cache — pedir outro console pergunta de novo', async () => {
    const pedidas: string[] = [];
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso(ARVORE_SNES, pedidas),
    });

    await busca('snes', 'super');
    await busca('gba', 'super');

    expect(pedidas).toHaveLength(2);
  });

  it('não guarda nada em cache quando a árvore falha em vir — a próxima tenta de novo', async () => {
    let tentativas = 0;
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: async () => {
        tentativas += 1;
        throw new Error('rede fora');
      },
    });

    await expect(busca('snes', 'super')).rejects.toThrow('rede fora');
    await expect(busca('snes', 'super')).rejects.toThrow('rede fora');

    expect(tentativas).toBe(2);
  });

  it('sobe erro quando o GitHub responde algo que não é 200', async () => {
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso(ARVORE_SNES, [], false),
    });

    await expect(busca('snes', 'super')).rejects.toThrow(/GitHub respondeu/);
  });

  it('respeita o teto de candidatos, mesmo quando o termo casa com muita coisa', async () => {
    const muitosNomes = Array.from({ length: 30 }, (_, i) => ({
      path: `Named_Boxarts/Jogo Repetido ${i} (USA).png`,
      type: 'blob',
    }));
    const busca = criarBuscaDeCapaPorNomeNoLibretro({
      buscarHttp: httpFalso({ truncated: false, tree: muitosNomes }),
    });

    const candidatos = await busca('snes', 'Jogo Repetido');

    expect(candidatos).toHaveLength(20);
  });
});
