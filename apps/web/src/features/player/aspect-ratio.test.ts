import { describe, expect, it } from 'vitest';
import { RESOLUCAO_NATIVA, calcularAreaDeExibicao } from './aspect-ratio.js';

describe('calcularAreaDeExibicao', () => {
  it('usa a altura base de PS1 quando informada', () => {
    expect(
      calcularAreaDeExibicao({ largura: 1000, altura: 700 }, '4:3', {
        escalaInteira: true,
        alturaNativa: 240,
      }),
    ).toEqual({ largura: 640, altura: 480 });
  });
  it('respeita 4:3 quando a altura é o limite', () => {
    expect(calcularAreaDeExibicao({ largura: 1000, altura: 300 }, '4:3')).toEqual({
      largura: 400,
      altura: 300,
    });
  });

  it('respeita 8:7 quando a largura é o limite', () => {
    expect(calcularAreaDeExibicao({ largura: 256, altura: 1000 }, '8:7')).toEqual({
      largura: 256,
      altura: 224,
    });
  });

  it('nunca estoura o espaço disponível', () => {
    const area = calcularAreaDeExibicao({ largura: 640, altura: 200 }, '4:3');
    expect(area.largura).toBeLessThanOrEqual(640);
    expect(area.altura).toBeLessThanOrEqual(200);
  });

  it('devolve zero sem espaço, porque canvas de tamanho negativo é erro de DOM', () => {
    expect(calcularAreaDeExibicao({ largura: 0, altura: 400 }, '4:3')).toEqual({
      largura: 0,
      altura: 0,
    });
  });

  it('com escala inteira, a altura é múltiplo exato da resolução nativa', () => {
    const area = calcularAreaDeExibicao({ largura: 4000, altura: 700 }, '8:7', {
      escalaInteira: true,
    });
    expect(area.altura % RESOLUCAO_NATIVA.altura).toBe(0);
    expect(area.altura).toBe(RESOLUCAO_NATIVA.altura * 3);
  });

  it('com escala inteira, cabe mesmo em telas menores que 1×', () => {
    const area = calcularAreaDeExibicao({ largura: 100, altura: 90 }, '8:7', {
      escalaInteira: true,
    });
    expect(area.altura).toBeLessThanOrEqual(90);
    expect(area.largura).toBeLessThanOrEqual(100);
  });
});
