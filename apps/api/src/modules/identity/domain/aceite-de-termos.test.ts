import { describe, expect, it } from 'vitest';
import { registrarAceiteDosTermos } from './aceite-de-termos.js';
import type { ErroDeIdentidade } from './erros.js';

describe('registrarAceiteDosTermos', () => {
  it('devolve o instante informado pelo servidor', () => {
    const agora = new Date('2026-09-07T12:00:00.000Z');
    expect(registrarAceiteDosTermos(true, agora)).toBe(agora);
  });

  it('é impossível obter um carimbo sem ter aceitado', () => {
    expect.assertions(1);
    try {
      registrarAceiteDosTermos(false, new Date());
    } catch (erro) {
      expect((erro as ErroDeIdentidade).codigo).toBe('TERMOS_NAO_ACEITOS');
    }
  });
});
