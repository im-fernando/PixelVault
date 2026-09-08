import { describe, expect, it } from 'vitest';
import { sha256DoArquivo, sistemaPelaExtensao, tituloDoArquivo } from './arquivo-de-rom.js';

describe('sistemaPelaExtensao', () => {
  it.each([
    ['Super Jogo.sfc', 'snes'],
    ['jogo.SMC', 'snes'],
    ['jogo.nes', 'nes'],
    ['jogo.gbc', 'gb'],
    ['jogo.gba', 'gba'],
    ['jogo.md', 'genesis'],
  ])('lê %s como %s', (nome, sistema) => {
    expect(sistemaPelaExtensao(nome)).toBe(sistema);
  });

  it.each(['jogo.zip', 'jogo', '.sfc', 'jogo.'])('não promete sistema nenhum para %s', (nome) => {
    expect(sistemaPelaExtensao(nome)).toBeNull();
  });
});

describe('tituloDoArquivo', () => {
  it('tira a extensão e os separadores de nome de dump', () => {
    expect(tituloDoArquivo('Super_Jogo_Bacana.sfc')).toBe('Super Jogo Bacana');
  });

  it('nunca devolve etiqueta vazia', () => {
    // Nome que é só extensão não tem título a extrair; o que sobra ainda é
    // melhor na etiqueta do que um cartucho sem nome nenhum.
    expect(tituloDoArquivo('.sfc')).toBe('sfc');
  });
});

describe('sha256DoArquivo', () => {
  it('é o SHA-256 do arquivo inteiro, em hexadecimal minúsculo', async () => {
    // Vetor conhecido: o SHA-256 de "abc".
    const hash = await sha256DoArquivo(new Blob([new TextEncoder().encode('abc')]));

    expect(hash).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
