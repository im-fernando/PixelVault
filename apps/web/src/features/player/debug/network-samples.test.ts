import { describe, expect, it } from 'vitest';
import { recursosDoEmulador } from './network-samples.js';

const ENTRADAS = [
  {
    name: 'http://localhost/emulator/snes9x2010/1.22.2/snes9x2010_libretro.wasm',
    duration: 640,
    transferSize: 1_180_000,
    encodedBodySize: 1_179_000,
    decodedBodySize: 3_950_601,
  },
  // O Nostalgist pede um pedaço da ROM antes de baixá-la inteira: a mesma URL
  // aparece duas vezes na Resource Timing.
  {
    name: 'http://localhost/roms/sure-instinct/sure-instinct.sfc',
    duration: 3,
    transferSize: 0,
    encodedBodySize: 1024,
    decodedBodySize: 1024,
  },
  {
    name: 'http://localhost/roms/sure-instinct/sure-instinct.sfc',
    duration: 12,
    transferSize: 0,
    encodedBodySize: 524_288,
    decodedBodySize: 524_288,
  },
  { name: 'http://localhost/assets/index-abc.css', duration: 3, transferSize: 900 },
];

describe('recursosDoEmulador', () => {
  it('separa o que veio da rede do que veio do cache', () => {
    const recursos = recursosDoEmulador(ENTRADAS);

    expect(recursos.map((r) => r.nome)).toEqual(['snes9x2010_libretro.wasm', 'sure-instinct.sfc']);
    expect(recursos[0]?.deCache).toBe(false);
    // Sem esta distinção, medir de novo com o cache quente vira uma "melhoria"
    // de 600 ms que ninguém fez.
    expect(recursos[1]?.deCache).toBe(true);
    // Uma linha por arquivo, e a que ficou é a que trouxe a ROM inteira.
    expect(recursos[1]?.bytesDecodificados).toBe(524_288);
  });

  it('ignora o que não é core nem ROM', () => {
    expect(recursosDoEmulador(ENTRADAS).some((r) => r.nome.endsWith('.css'))).toBe(false);
  });

  it('sem Resource Timing devolve lista vazia, e não erro', () => {
    expect(recursosDoEmulador([])).toEqual([]);
  });
});
