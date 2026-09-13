import { describe, expect, it } from 'vitest';
import type { LibraryRom } from '@pixelvault/contracts';
import { filtrarBiblioteca } from './filtrar-biblioteca.js';

const rom = (
  title: string,
  fileName: string,
  isFavorite: boolean,
  sizeBytes: number,
): LibraryRom => ({
  id: title,
  title,
  fileName,
  isFavorite,
  sizeBytes,
  systemId: 'snes',
  gameId: null,
  coverUrl: null,
  sha256: 'a'.repeat(64),
  uploadedAt: '2026-09-01T00:00:00.000Z',
});
const jogos = [
  rom('Zelda', 'zelda-jp.sfc', false, 300),
  rom('Ação', 'action-br.sfc', true, 100),
  rom('Mario', 'mario.sfc', true, 200),
];

describe('busca da biblioteca', () => {
  it('combina título e arquivo, ignorando acentos, caixa e espaços extras', () => {
    expect(filtrarBiblioteca(jogos, '  ACAO  BR ', false, 'original')).toEqual([jogos[1]]);
  });
  it('combina busca e favoritos sem confundir ausência de resultados com biblioteca vazia', () => {
    expect(filtrarBiblioteca(jogos, 'zelda', true, 'original')).toEqual([]);
    expect(filtrarBiblioteca(jogos, '', true, 'original')).toEqual([jogos[1], jogos[2]]);
  });
  it('ordena sem alterar a coleção compartilhada com a vitrine', () => {
    const original = [...jogos];
    expect(filtrarBiblioteca(jogos, '', false, 'titulo').map((j) => j.title)).toEqual([
      'Ação',
      'Mario',
      'Zelda',
    ]);
    expect(filtrarBiblioteca(jogos, '', false, 'tamanho').map((j) => j.sizeBytes)).toEqual([
      300, 200, 100,
    ]);
    expect(filtrarBiblioteca(jogos, '', false, 'original')).toEqual([jogos[1], jogos[2], jogos[0]]);
    expect(jogos).toEqual(original);
  });
});
