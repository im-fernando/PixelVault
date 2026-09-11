import { describe, expect, it } from 'vitest';
import { formatarPlaytime } from './formatar-playtime.js';

describe('formatarPlaytime', () => {
  it('mostra "menos de 1min" para menos de um minuto', () => {
    expect(formatarPlaytime(0)).toBe('menos de 1min');
    expect(formatarPlaytime(59)).toBe('menos de 1min');
  });

  it('mostra só minutos quando não completa uma hora', () => {
    expect(formatarPlaytime(60)).toBe('1min');
    expect(formatarPlaytime(59 * 60)).toBe('59min');
  });

  it('mostra só horas quando os minutos são exatos', () => {
    expect(formatarPlaytime(2 * 3600)).toBe('2h');
  });

  it('mostra horas e minutos juntos', () => {
    expect(formatarPlaytime(2 * 3600 + 20 * 60)).toBe('2h 20min');
  });
});
