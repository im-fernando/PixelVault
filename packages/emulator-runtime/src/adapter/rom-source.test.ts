import { afterEach, describe, expect, it, vi } from 'vitest';
import { RomInvalidError } from './errors.js';
import {
  describeRomSource,
  openRomStream,
  readRomHeader,
  romFromBlob,
  romFromBytes,
  romFromUrl,
} from './rom-source.js';

const CONTEUDO = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);

async function lerTudo(stream: ReadableStream<Uint8Array>): Promise<Uint8Array> {
  const pedacos: number[] = [];
  const leitor = stream.getReader();
  for (;;) {
    const { done, value } = await leitor.read();
    if (done || value === undefined) {
      break;
    }
    pedacos.push(...value);
  }
  return new Uint8Array(pedacos);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('construtores de RomSource', () => {
  it('preenche byteLength quando a origem sabe informar sem ler nada', () => {
    expect(romFromBytes(CONTEUDO).byteLength).toBe(8);
    expect(romFromBlob(new Blob([CONTEUDO])).byteLength).toBe(8);
  });

  it('não inventa byteLength para URL — só quem chamou pode saber', () => {
    expect(romFromUrl('https://exemplo.test/jogo.sfc').byteLength).toBeUndefined();
    expect(romFromUrl('https://exemplo.test/jogo.sfc', { byteLength: 4_194_304 }).byteLength).toBe(
      4_194_304,
    );
  });

  it('carrega o nome do arquivo, que é como o core decide o formato', () => {
    expect(romFromBytes(CONTEUDO, { fileName: 'zelda.sfc' }).fileName).toBe('zelda.sfc');
  });
});

describe('describeRomSource', () => {
  it('nunca expõe o conteúdo da ROM', () => {
    expect(describeRomSource(romFromBytes(CONTEUDO))).toBe('bytes:8');
    expect(describeRomSource(romFromBytes(CONTEUDO, { fileName: 'zelda.sfc' }))).toBe('zelda.sfc');
    expect(describeRomSource(romFromUrl('https://exemplo.test/jogo.sfc'))).toBe(
      'https://exemplo.test/jogo.sfc',
    );
  });
});

describe('openRomStream', () => {
  it('transmite os bytes em memória', async () => {
    expect(await lerTudo(await openRomStream(romFromBytes(CONTEUDO)))).toEqual(CONTEUDO);
  });

  it('transmite o Blob sem materializá-lo antes', async () => {
    expect(await lerTudo(await openRomStream(romFromBlob(new Blob([CONTEUDO]))))).toEqual(CONTEUDO);
  });

  it('transmite a resposta HTTP', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(CONTEUDO))),
    );

    expect(await lerTudo(await openRomStream(romFromUrl('https://exemplo.test/jogo.sfc')))).toEqual(
      CONTEUDO,
    );
  });

  it('trata resposta ruim como ROM inválida — quem joga não distingue os dois casos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );

    await expect(openRomStream(romFromUrl('https://exemplo.test/nada.sfc'))).rejects.toBeInstanceOf(
      RomInvalidError,
    );
  });
});

describe('readRomHeader', () => {
  it('lê só o começo dos bytes em memória', async () => {
    expect(await readRomHeader(romFromBytes(CONTEUDO), 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
  });

  it('fatia o Blob em vez de lê-lo inteiro', async () => {
    const blob = new Blob([CONTEUDO]);
    const espiao = vi.spyOn(blob, 'slice');

    expect(await readRomHeader(romFromBlob(blob), 4)).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(espiao).toHaveBeenCalledWith(0, 4);
  });

  it('devolve vazio quando não se pede byte nenhum', async () => {
    expect(await readRomHeader(romFromBytes(CONTEUDO), 0)).toEqual(new Uint8Array(0));
  });

  it('pede Range e cancela o resto quando o servidor ignora o Range', async () => {
    let cancelado = false;
    const corpo = new ReadableStream<Uint8Array>({
      pull(controller) {
        // Servidor que ignora Range: mandaria a ROM inteira.
        controller.enqueue(new Uint8Array(1024));
      },
      cancel() {
        cancelado = true;
      },
    });
    const fetchFalso = vi.fn(() => Promise.resolve(new Response(corpo)));
    vi.stubGlobal('fetch', fetchFalso);

    const cabecalho = await readRomHeader(romFromUrl('https://exemplo.test/jogo.sfc'), 16);

    expect(cabecalho.byteLength).toBe(16);
    expect(cancelado).toBe(true);
    expect(fetchFalso).toHaveBeenCalledWith('https://exemplo.test/jogo.sfc', {
      headers: { Range: 'bytes=0-15' },
    });
  });

  it('devolve menos bytes do que o pedido quando a ROM é menor', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(CONTEUDO))),
    );

    expect((await readRomHeader(romFromUrl('https://exemplo.test/jogo.sfc'), 64)).byteLength).toBe(
      8,
    );
  });
});
