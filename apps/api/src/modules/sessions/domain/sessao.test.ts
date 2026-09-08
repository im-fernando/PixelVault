import { describe, expect, it } from 'vitest';
import {
  calcularExpiracao,
  DURACAO_DA_SESSAO_MS,
  precisaRenovar,
  sessaoExpirou,
} from './sessao.js';

const AGORA = new Date('2026-09-07T12:00:00.000Z');
const DIA = 24 * 60 * 60 * 1000;

function daquiA(ms: number): Date {
  return new Date(AGORA.getTime() + ms);
}

describe('calcularExpiracao', () => {
  it('dá 30 dias de vida à sessão', () => {
    expect(calcularExpiracao(AGORA).getTime()).toBe(AGORA.getTime() + 30 * DIA);
    expect(DURACAO_DA_SESSAO_MS).toBe(30 * DIA);
  });
});

describe('sessaoExpirou', () => {
  it('aceita sessão com prazo pela frente', () => {
    expect(sessaoExpirou(daquiA(1), AGORA)).toBe(false);
  });

  it('recusa no exato instante da expiração', () => {
    expect(sessaoExpirou(AGORA, AGORA)).toBe(true);
  });

  it('recusa sessão vencida', () => {
    expect(sessaoExpirou(daquiA(-1), AGORA)).toBe(true);
  });
});

describe('precisaRenovar', () => {
  it('não renova enquanto resta mais da metade do prazo', () => {
    expect(precisaRenovar(daquiA(30 * DIA), AGORA)).toBe(false);
    expect(precisaRenovar(daquiA(16 * DIA), AGORA)).toBe(false);
  });

  it('não renova exatamente na metade — só abaixo dela', () => {
    expect(precisaRenovar(daquiA(15 * DIA), AGORA)).toBe(false);
    expect(precisaRenovar(daquiA(15 * DIA - 1), AGORA)).toBe(true);
  });

  it('renova quando resta pouco', () => {
    expect(precisaRenovar(daquiA(1), AGORA)).toBe(true);
  });

  it('não ressuscita sessão já expirada', () => {
    // Sem esta guarda, uma sessão vencida há um ano "precisaria renovar" e
    // voltaria a valer por mais 30 dias.
    expect(precisaRenovar(AGORA, AGORA)).toBe(false);
    expect(precisaRenovar(daquiA(-365 * DIA), AGORA)).toBe(false);
  });
});
