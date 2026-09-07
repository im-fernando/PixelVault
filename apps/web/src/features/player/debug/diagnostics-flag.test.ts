import { describe, expect, it } from 'vitest';
import {
  ATALHO_DE_DIAGNOSTICO,
  CHAVE_DE_DIAGNOSTICO,
  diagnosticoLigadoNaEntrada,
} from './diagnostics-flag.js';
import { MAPA_PADRAO_DE_TECLADO } from '../input/snes-keymap.js';

const guardado = (valor: string | null) => ({ getItem: () => valor });
const vazio = guardado(null);

describe('atalho do diagnóstico', () => {
  it('não colide com o controle de SNES nem com os atalhos do HUD', () => {
    const usados = new Set([
      ...Object.keys(MAPA_PADRAO_DE_TECLADO),
      'Space',
      'KeyR',
      'KeyF',
      'F2',
      'F4',
    ]);
    expect(usados.has(ATALHO_DE_DIAGNOSTICO)).toBe(false);
  });
});

describe('diagnosticoLigadoNaEntrada', () => {
  it('nasce desligado', () => {
    expect(diagnosticoLigadoNaEntrada('', vazio)).toBe(false);
    expect(diagnosticoLigadoNaEntrada('?outra=coisa', vazio)).toBe(false);
  });

  it('liga pela URL, com ou sem valor', () => {
    expect(diagnosticoLigadoNaEntrada('?diagnostico=1', vazio)).toBe(true);
    expect(diagnosticoLigadoNaEntrada('?diagnostico', vazio)).toBe(true);
    expect(diagnosticoLigadoNaEntrada('?diagnostico=true', vazio)).toBe(true);
  });

  it('a URL manda mais que a sessão: `?diagnostico=0` desliga o que estava ligado', () => {
    expect(diagnosticoLigadoNaEntrada('?diagnostico=0', guardado('1'))).toBe(false);
  });

  it('lembra dentro da sessão o que o F3 abriu', () => {
    expect(diagnosticoLigadoNaEntrada('', guardado('1'))).toBe(true);
    expect(diagnosticoLigadoNaEntrada('', guardado('0'))).toBe(false);
  });

  it('armazenamento que joga ao ser lido não derruba o player', () => {
    const bloqueado = {
      getItem: (): string | null => {
        throw new Error('SecurityError');
      },
    };
    expect(diagnosticoLigadoNaEntrada('', bloqueado)).toBe(false);
  });

  it('a chave guardada é a mesma que o hook grava', () => {
    expect(CHAVE_DE_DIAGNOSTICO).toBe('pixelvault:diagnostico');
  });
});
