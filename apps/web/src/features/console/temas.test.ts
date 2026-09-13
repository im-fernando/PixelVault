// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CHAVE_PREFERENCIAS, lerPreferencias, salvarPreferencias } from './temas.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('preferências do console', () => {
  it('mantém o Solstice claro para preferências anteriores ao modo escuro', () => {
    localStorage.setItem(
      CHAVE_PREFERENCIAS,
      JSON.stringify({ tema: 'solstice', movimento: false, ambiente: false, sons: false }),
    );
    expect(lerPreferencias()).toEqual({
      tema: 'solstice',
      auroraWhite: false,
      solsticeEscuro: false,
      movimento: false,
      ambiente: false,
      sons: false,
    });
  });

  it('persiste a variante escura junto às outras preferências', () => {
    const preferencias = { ...lerPreferencias(), tema: 'solstice' as const, solsticeEscuro: true };
    expect(salvarPreferencias(preferencias)).toBe(true);
    expect(lerPreferencias()).toEqual(preferencias);
  });

  it.each(['true', 'dark', 1, null, {}])('descarta variante inválida: %j', (solsticeEscuro) => {
    localStorage.setItem(CHAVE_PREFERENCIAS, JSON.stringify({ tema: 'solstice', solsticeEscuro }));
    expect(lerPreferencias()).toMatchObject({ tema: 'solstice', solsticeEscuro: false });
  });

  it('oferece os padrões quando a leitura do armazenamento está bloqueada', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('Armazenamento bloqueado');
    });
    expect(lerPreferencias()).toMatchObject({ tema: 'aurora', solsticeEscuro: false });
  });

  it('informa falha de persistência sem impedir a aplicação na sessão', () => {
    const preferencias = { ...lerPreferencias(), solsticeEscuro: true };
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('Armazenamento bloqueado');
    });
    expect(salvarPreferencias(preferencias)).toBe(false);
    expect(preferencias.solsticeEscuro).toBe(true);
  });
});
