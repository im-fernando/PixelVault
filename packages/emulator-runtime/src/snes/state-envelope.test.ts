import { describe, expect, it } from 'vitest';
import { StateIncompatibleError } from '../adapter/errors.js';
import { desempacotarEstado, empacotarEstado } from './state-envelope.js';

const ENVELOPE = {
  systemId: 'snes',
  coreVersion: 'snes9x2010@1.22.2',
  romId: '80000-deadbeef',
  estado: new Uint8Array([0x23, 0x52, 0x5a, 0x49, 0x50, 0x76, 0x01, 0x23]),
};

describe('envelope de save state', () => {
  it('faz ida e volta sem perder byte', () => {
    expect(desempacotarEstado(empacotarEstado(ENVELOPE))).toEqual(ENVELOPE);
  });

  it('aguenta estado vazio e identificadores com acento', () => {
    const envelope = { ...ENVELOPE, romId: 'ção-1', estado: new Uint8Array(0) };

    expect(desempacotarEstado(empacotarEstado(envelope))).toEqual(envelope);
  });

  it('devolve cópia, e não janela sobre os bytes recebidos', () => {
    const bytes = empacotarEstado(ENVELOPE);
    const desempacotado = desempacotarEstado(bytes);
    bytes.fill(0);

    expect(desempacotado.estado).toEqual(ENVELOPE.estado);
  });

  it('recusa arquivo que não é save state nosso', () => {
    expect(() => desempacotarEstado(new Uint8Array([1, 2, 3, 4, 5]))).toThrowError(
      StateIncompatibleError,
    );
  });

  it('recusa formato de versão desconhecida — é o caminho de migração futura', () => {
    const bytes = empacotarEstado(ENVELOPE);
    bytes[4] = 99;

    expect(() => desempacotarEstado(bytes)).toThrowError(/versão 99/);
  });

  it('recusa arquivo truncado em vez de devolver lixo', () => {
    const bytes = empacotarEstado(ENVELOPE);

    expect(() => desempacotarEstado(bytes.slice(0, bytes.byteLength - 3))).toThrowError(/truncado/);
  });

  it('recusa arquivo curto demais para ter cabeçalho', () => {
    expect(() => desempacotarEstado(new Uint8Array(2))).toThrowError(StateIncompatibleError);
  });
});
