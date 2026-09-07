import { describe, expect, it } from 'vitest';
import { assertCompatible, describeIncompatibility, isCompatible } from './compatibility.js';
import { SaveIncompatibleError } from './errors.js';
import { SAVE_RECORD_FORMAT, type SaveMetadata } from './save-record.js';

const MAQUINA = { systemId: 'snes', coreVersion: 'fake-1.0.0' } as const;

function metadata(overrides: Partial<SaveMetadata> = {}): SaveMetadata {
  return {
    format: SAVE_RECORD_FORMAT,
    kind: 'state',
    romId: 'd'.repeat(64),
    slot: 0,
    systemId: 'snes',
    coreVersion: 'fake-1.0.0',
    byteLength: 128,
    updatedAt: 1_700_000_000_000,
    hasThumbnail: true,
    ...overrides,
  };
}

describe('compatibilidade de save state', () => {
  it('aceita o que veio da mesma máquina', () => {
    expect(describeIncompatibility(metadata(), MAQUINA)).toBeNull();
    expect(isCompatible(metadata(), MAQUINA)).toBe(true);
  });

  it('recusa outra versão de core, explicando as duas pontas', () => {
    const motivo = describeIncompatibility(metadata({ coreVersion: 'fake-0.9.0' }), MAQUINA);
    expect(motivo).toContain('fake-0.9.0');
    expect(motivo).toContain('fake-1.0.0');
    expect(motivo).toContain('corromperia');
  });

  it('recusa outro console', () => {
    expect(describeIncompatibility(metadata({ systemId: 'gb' }), MAQUINA)).toContain('gb');
  });

  it('recusa formato de registro que este código não sabe ler', () => {
    const futuro = { ...metadata(), format: 99 } as unknown as SaveMetadata;
    expect(describeIncompatibility(futuro, MAQUINA)).toContain('formato 99');
  });

  it('assertCompatible estoura com o mesmo motivo', () => {
    expect(() => assertCompatible(metadata({ coreVersion: 'outra' }), MAQUINA)).toThrow(
      SaveIncompatibleError,
    );
  });
});

describe('compatibilidade de SRAM', () => {
  /**
   * A distinção que a issue #22 pede em todo lugar: a SRAM é do cartucho, e o
   * cartucho não sabe qual core está lendo a bateria dele.
   */
  it('atravessa versão de core', () => {
    const sram = metadata({ kind: 'sram', coreVersion: 'fake-0.1.0' });
    expect(describeIncompatibility(sram, MAQUINA)).toBeNull();
  });

  it('mas não atravessa console', () => {
    const sram = metadata({ kind: 'sram', systemId: 'genesis' });
    expect(describeIncompatibility(sram, MAQUINA)).toContain('genesis');
  });
});
