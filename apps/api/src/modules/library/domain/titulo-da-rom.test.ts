import { describe, expect, it } from 'vitest';
import { tituloPeloNomeDoArquivo } from './titulo-da-rom.js';

describe('tituloPeloNomeDoArquivo', () => {
  it('tira a extensão', () => {
    expect(tituloPeloNomeDoArquivo('Super Metroid.sfc')).toBe('Super Metroid');
  });

  it('troca os separadores de nome de dump por espaço', () => {
    expect(tituloPeloNomeDoArquivo('Chrono_Trigger_USA.sfc')).toBe('Chrono Trigger USA');
  });

  it('preserva região e revisão, que são informação de quem enviou', () => {
    expect(tituloPeloNomeDoArquivo('Zelda - A Link to the Past (U) [!].smc')).toBe(
      'Zelda - A Link to the Past (U) [!]',
    );
  });

  it('não confunde ponto de separador com extensão', () => {
    expect(tituloPeloNomeDoArquivo('Final.Fantasy.VI.sfc')).toBe('Final Fantasy VI');
  });

  it('nome que começa com ponto não tem extensão a tirar', () => {
    expect(tituloPeloNomeDoArquivo('.sfc')).toBe('sfc');
  });

  it('devolve o nome cru quando não sobra nada para chamar de título', () => {
    // Etiqueta vazia é pior que etiqueta feia — a ROM está na estante, e
    // precisa de alguma coisa escrita na lombada.
    expect(tituloPeloNomeDoArquivo('__.__')).toBe('__.__');
  });

  it('aceita nome sem extensão nenhuma', () => {
    expect(tituloPeloNomeDoArquivo('rom-sem-extensao')).toBe('rom-sem-extensao');
  });
});
