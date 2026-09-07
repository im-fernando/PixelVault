import { describe, expect, it } from 'vitest';
import { INTERVALO_ALVO_MS, MedidorDePacing, julgarPacing, percentil } from './frame-pacing.js';

/** Alimenta o medidor com uma sequência de intervalos, em milissegundos. */
function alimentar(medidor: MedidorDePacing, intervalos: readonly number[]): void {
  let instante = 1000;
  medidor.registrar(instante);
  for (const intervalo of intervalos) {
    instante += intervalo;
    medidor.registrar(instante);
  }
}

const SESSENTA_HZ = Array.from({ length: 120 }, () => INTERVALO_ALVO_MS);

describe('MedidorDePacing', () => {
  it('60 Hz perfeito dá 60 fps, variância zero e nenhum atraso', () => {
    const medidor = new MedidorDePacing();
    alimentar(medidor, SESSENTA_HZ);
    const estatistica = medidor.estatistica();

    expect(estatistica.amostras).toBe(120);
    expect(estatistica.fps).toBeCloseTo(60, 5);
    expect(estatistica.desvioPadraoMs).toBeCloseTo(0, 5);
    expect(estatistica.quadrosAtrasados).toBe(0);
    expect(estatistica.quadrosPerdidos).toBe(0);
    expect(julgarPacing(estatistica)).toBe('estavel');
  });

  it('separa 60 fps com engasgo de 60 fps de verdade — o ponto da issue #26', () => {
    // Um segundo com 59 quadros no ritmo e um de 100 ms fecha em ~60 fps de
    // média. É o caso que o overlay não pode deixar passar como saudável.
    const comEngasgo = [...Array.from({ length: 59 }, () => 15.2), 100];
    const medidor = new MedidorDePacing();
    alimentar(medidor, comEngasgo);
    const estatistica = medidor.estatistica();

    expect(estatistica.fps).toBeGreaterThan(58);
    expect(estatistica.fps).toBeLessThan(62);
    // A média não acusa nada; a cauda e a contagem de atraso acusam.
    expect(estatistica.quadrosAtrasados).toBe(1);
    expect(estatistica.quadrosPerdidos).toBe(5);
    expect(estatistica.piorMs).toBe(100);
    expect(julgarPacing(estatistica)).toBe('engasgando');
  });

  it('30 fps estável não é engasgo: é throughput baixo com pacing bom', () => {
    const medidor = new MedidorDePacing();
    alimentar(
      medidor,
      Array.from({ length: 90 }, () => INTERVALO_ALVO_MS * 2),
    );
    const estatistica = medidor.estatistica();

    expect(estatistica.fps).toBeCloseTo(30, 4);
    expect(estatistica.desvioPadraoMs).toBeCloseTo(0, 5);
    // Todo quadro está atrasado em relação ao alvo de 60 Hz, e isso precisa
    // aparecer — mas o número de fps já contava metade da história sozinho.
    expect(estatistica.proporcaoAtrasada).toBe(1);
    expect(julgarPacing(estatistica)).toBe('engasgando');
  });

  it('pausa longa vira interrupção, não trezentos quadros perdidos', () => {
    const medidor = new MedidorDePacing();
    alimentar(medidor, [...SESSENTA_HZ, 5000, ...SESSENTA_HZ]);
    const estatistica = medidor.estatistica();

    expect(estatistica.interrupcoes).toBe(1);
    expect(estatistica.quadrosPerdidos).toBe(0);
    expect(estatistica.piorMs).toBeCloseTo(INTERVALO_ALVO_MS, 5);
  });

  it('a janela desliza: o engasgo de trinta segundos atrás sai da conta', () => {
    const medidor = new MedidorDePacing({ tamanhoDaJanela: 10 });
    alimentar(medidor, [200, ...Array.from({ length: 10 }, () => INTERVALO_ALVO_MS)]);

    expect(medidor.estatistica().amostras).toBe(10);
    expect(medidor.estatistica().quadrosAtrasados).toBe(0);
  });

  it('ignora intervalo não positivo em vez de contaminar a variância', () => {
    const medidor = new MedidorDePacing();
    medidor.registrar(500);
    medidor.registrar(500);
    medidor.registrar(400);

    expect(medidor.estatistica().amostras).toBe(0);
  });

  it('reiniciar zera a janela e o instante anterior', () => {
    const medidor = new MedidorDePacing();
    alimentar(medidor, SESSENTA_HZ);
    medidor.reiniciar();

    expect(medidor.estatistica().amostras).toBe(0);
    // Sem zerar o instante anterior, o primeiro quadro depois do reinício
    // viraria um intervalo gigante inventado.
    medidor.registrar(9_000_000);
    medidor.registrar(9_000_016);
    expect(medidor.estatistica().amostras).toBe(1);
  });
});

describe('percentil', () => {
  it('devolve um valor que existe na amostra, sem interpolar', () => {
    const ordenados = [10, 20, 30, 40, 100];
    expect(percentil(ordenados, 0.5)).toBe(30);
    expect(percentil(ordenados, 0.95)).toBe(100);
    expect(percentil(ordenados, 0)).toBe(10);
  });

  it('lista vazia não quebra', () => {
    expect(percentil([], 0.99)).toBe(0);
  });
});

describe('julgarPacing', () => {
  it('não julga com amostra pequena demais', () => {
    const medidor = new MedidorDePacing();
    alimentar(medidor, SESSENTA_HZ.slice(0, 5));
    expect(julgarPacing(medidor.estatistica())).toBe('sem-dados');
  });

  it('variação pequena e sem atraso ainda é irregular, não engasgo', () => {
    const medidor = new MedidorDePacing();
    alimentar(
      medidor,
      Array.from({ length: 60 }, (_, i) => (i % 2 === 0 ? 12 : 21)),
    );
    expect(julgarPacing(medidor.estatistica())).toBe('irregular');
  });
});
