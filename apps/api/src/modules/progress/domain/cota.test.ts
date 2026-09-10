import { describe, expect, it } from 'vitest';
import { COTA_DE_SAVE_NA_NUVEM_EM_BYTES } from '@pixelvault/contracts';
import { estouraCotaDeSave } from './cota.js';

const VAZIA = { bytes: 0 };

describe('estouraCotaDeSave', () => {
  it('deixa passar quem tem espaço', () => {
    expect(estouraCotaDeSave(VAZIA, 0, 256 * 1024)).toBe(false);
    expect(estouraCotaDeSave({ bytes: 1024 }, 0, 1024)).toBe(false);
  });

  it('a fronteira é inclusiva: chegar ao número não é estourá-lo', () => {
    const uso = { bytes: COTA_DE_SAVE_NA_NUVEM_EM_BYTES - 4096 };

    expect(estouraCotaDeSave(uso, 0, 4096)).toBe(false);
    expect(estouraCotaDeSave(uso, 0, 4097)).toBe(true);
  });

  it('recusa quem já está no teto, mesmo pedindo um byte', () => {
    const cheia = { bytes: COTA_DE_SAVE_NA_NUVEM_EM_BYTES };

    expect(estouraCotaDeSave(cheia, 0, 1)).toBe(true);
  });

  it('desconta o save anterior daquele romId — regravar não é gasto em dobro', () => {
    // A conta está exatamente na cota, toda ela num save só. Trocar aquele
    // save por outro do mesmo tamanho tem que caber, porque a soma não muda.
    const cheiaComUmSave = { bytes: COTA_DE_SAVE_NA_NUVEM_EM_BYTES };
    const tamanhoDoSaveAtual = COTA_DE_SAVE_NA_NUVEM_EM_BYTES;

    expect(estouraCotaDeSave(cheiaComUmSave, tamanhoDoSaveAtual, tamanhoDoSaveAtual)).toBe(false);
    // Um save maior que o que ele substitui, mesmo por um byte, não cabe.
    expect(estouraCotaDeSave(cheiaComUmSave, tamanhoDoSaveAtual, tamanhoDoSaveAtual + 1)).toBe(
      true,
    );
    // Trocar por um menor sobra espaço, e continua cabendo.
    expect(estouraCotaDeSave(cheiaComUmSave, tamanhoDoSaveAtual, tamanhoDoSaveAtual - 100)).toBe(
      false,
    );
  });

  it('a cota comporta a biblioteca generosa dos cinco sistemas com folga', () => {
    // O perfil que calibra o número, escrito como asserção para que baixar a
    // constante quebre aqui, e não no primeiro dispositivo de verdade.
    const bibliotecaGenerosa =
      100 * 8 * 1024 + 100 * 32 * 1024 + 100 * 32 * 1024 + 150 * 8 * 1024 + 100 * 128 * 1024;

    expect(estouraCotaDeSave({ bytes: bibliotecaGenerosa }, 0, 0)).toBe(false);
    expect(bibliotecaGenerosa).toBeLessThan(COTA_DE_SAVE_NA_NUVEM_EM_BYTES);
  });
});
