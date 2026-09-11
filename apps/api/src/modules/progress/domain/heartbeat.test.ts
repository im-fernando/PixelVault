import { describe, expect, it } from 'vitest';
import { calcularCreditoDoHeartbeat } from './heartbeat.js';

const TETO = 30;

describe('calcularCreditoDoHeartbeat', () => {
  it('credita zero no primeiro heartbeat de uma sessão (sem marco anterior)', () => {
    const agora = new Date('2026-09-10T12:00:00.000Z');
    expect(calcularCreditoDoHeartbeat(null, agora, TETO)).toBe(0);
  });

  it('credita o intervalo cheio quando ele cabe dentro do teto', () => {
    const antes = new Date('2026-09-10T12:00:00.000Z');
    const agora = new Date('2026-09-10T12:00:20.000Z');
    expect(calcularCreditoDoHeartbeat(antes, agora, TETO)).toBe(20);
  });

  it('credita no máximo o teto quando o intervalo é maior — aba oculta e voltou', () => {
    const antes = new Date('2026-09-10T12:00:00.000Z');
    const agora = new Date('2026-09-10T13:00:00.000Z'); // uma hora de hiato
    expect(calcularCreditoDoHeartbeat(antes, agora, TETO)).toBe(TETO);
  });

  it('credita zero para um heartbeat que chega antes do marco anterior — replay/fora de ordem', () => {
    const antes = new Date('2026-09-10T12:00:20.000Z');
    const agora = new Date('2026-09-10T12:00:10.000Z'); // "agora" no passado do marco
    expect(calcularCreditoDoHeartbeat(antes, agora, TETO)).toBe(0);
  });

  it('credita zero quando o intervalo é zero — dois heartbeats no mesmo instante', () => {
    const instante = new Date('2026-09-10T12:00:00.000Z');
    expect(calcularCreditoDoHeartbeat(instante, instante, TETO)).toBe(0);
  });
});
