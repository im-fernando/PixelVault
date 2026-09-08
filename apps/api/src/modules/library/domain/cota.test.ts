import { describe, expect, it } from 'vitest';
import {
  COTA_DE_ARMAZENAMENTO_EM_BYTES,
  COTA_DE_ROMS_POR_CONTA,
  TAMANHO_MAXIMO_DE_ROM_EM_BYTES,
} from '@pixelvault/contracts';
import { recusaPorCota } from './cota.js';

const VAZIA = { bytes: 0, quantidade: 0 };

describe('recusaPorCota', () => {
  it('deixa passar quem tem espaço', () => {
    expect(recusaPorCota(VAZIA, TAMANHO_MAXIMO_DE_ROM_EM_BYTES)).toBeNull();
    expect(recusaPorCota({ bytes: 1_000_000_000, quantidade: 200 }, 8 * 1024 * 1024)).toBeNull();
  });

  it('deixa passar o arquivo que fecha a cota exatamente', () => {
    // A fronteira é inclusiva de propósito: chegar ao número não é estourá-lo.
    const uso = { bytes: COTA_DE_ARMAZENAMENTO_EM_BYTES - 4 * 1024 * 1024, quantidade: 10 };

    expect(recusaPorCota(uso, 4 * 1024 * 1024)).toBeNull();
    expect(recusaPorCota(uso, 4 * 1024 * 1024 + 1)).toBe('LIMITE_DE_BYTES');
  });

  it('recusa quem já está no teto de bytes, mesmo pedindo um byte', () => {
    const cheia = { bytes: COTA_DE_ARMAZENAMENTO_EM_BYTES, quantidade: 64 };

    expect(recusaPorCota(cheia, 1)).toBe('LIMITE_DE_BYTES');
  });

  it('recusa por quantidade quem tem espaço de sobra em bytes', () => {
    // O eixo que os bytes não cobrem: homebrew de GBA é aceito a partir de
    // 192 bytes, então milhares de linhas cabem em quase nenhum gigabyte.
    const muitasEPequenas = { bytes: 1024 * 1024, quantidade: COTA_DE_ROMS_POR_CONTA };

    expect(recusaPorCota(muitasEPequenas, 192)).toBe('LIMITE_DE_ARQUIVOS');
    expect(recusaPorCota({ ...muitasEPequenas, quantidade: COTA_DE_ROMS_POR_CONTA - 1 }, 192)).toBe(
      null,
    );
  });

  it('reporta o eixo dos bytes quando os dois estouram', () => {
    // É o que a pessoa esbarra na prática, e é a frase que resolve o problema
    // dela: liberar espaço. Dizer "são 1500 arquivos" a quem tem 4 GiB de
    // GBA seria mandá-la contar arquivo em vez de olhar o tamanho.
    const nosDois = { bytes: COTA_DE_ARMAZENAMENTO_EM_BYTES, quantidade: COTA_DE_ROMS_POR_CONTA };

    expect(recusaPorCota(nosDois, 1)).toBe('LIMITE_DE_BYTES');
  });

  it('a cota comporta uma biblioteca pessoal generosa dos cinco sistemas', () => {
    // O perfil que calibra o número, escrito como asserção para que mudar a
    // constante para baixo quebre aqui, e não no primeiro usuário de verdade:
    // 550 ROMs com o GBA puxando a média para cima.
    const bibliotecaGenerosa =
      100 * 256 * 1024 + 100 * 1024 * 1024 + 100 * 2 * 1024 * 1024 + 150 * 2 * 1024 * 1024;
    const comGba = { bytes: bibliotecaGenerosa + 100 * 12 * 1024 * 1024, quantidade: 550 };

    expect(recusaPorCota(comGba, 32 * 1024 * 1024)).toBeNull();
  });
});
