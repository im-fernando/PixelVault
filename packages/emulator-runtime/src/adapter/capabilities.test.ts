import { describe, expect, it } from 'vitest';
import { NO_CAPABILITIES, defineCapabilities, supportsCapability } from './capabilities.js';
import { CapabilityUnsupportedError, requireCapability } from './errors.js';

describe('defineCapabilities', () => {
  it('deixa em false tudo que não foi declarado', () => {
    const capacidades = defineCapabilities({ saveState: true });

    expect(capacidades).toEqual({
      saveState: true,
      sram: false,
      rewind: false,
      memoryRead: false,
      cheats: false,
      netplay: false,
    });
  });

  it('não suporta nada quando nada é declarado — o default nunca é otimista', () => {
    expect(defineCapabilities({})).toEqual(NO_CAPABILITIES);
  });

  it('permite desligar explicitamente', () => {
    expect(defineCapabilities({ saveState: false }).saveState).toBe(false);
  });
});

describe('requireCapability', () => {
  it('deixa passar o que é suportado', () => {
    expect(() => requireCapability(defineCapabilities({ sram: true }), 'sram')).not.toThrow();
  });

  it('estoura com código estável no que não é', () => {
    expect(() => requireCapability(NO_CAPABILITIES, 'saveState')).toThrowError(
      CapabilityUnsupportedError,
    );

    try {
      requireCapability(NO_CAPABILITIES, 'rewind');
      expect.unreachable('deveria ter estourado');
    } catch (erro) {
      expect(erro).toMatchObject({ code: 'CAPABILITY_UNSUPPORTED', capability: 'rewind' });
    }
  });
});

describe('supportsCapability', () => {
  it('responde sem estourar, que é o que a UI precisa para decidir o que desenhar', () => {
    const capacidades = defineCapabilities({ netplay: true });

    expect(supportsCapability(capacidades, 'netplay')).toBe(true);
    expect(supportsCapability(capacidades, 'cheats')).toBe(false);
  });
});
