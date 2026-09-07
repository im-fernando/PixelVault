import { describe, expect, it, vi } from 'vitest';
import { RomInvalidError } from '../adapter/errors.js';
import { romFromBlob, romFromBytes } from '../adapter/rom-source.js';
import { lerRomDeSnes, reconhecerCabecalho, triarRomDeSnes } from './snes-rom.js';

interface OpcoesDeRomFalsa {
  readonly tamanho?: number;
  readonly offsetDoCabecalho?: number;
  readonly titulo?: string;
  readonly expoenteDeSram?: number;
  readonly cabecalhoDeCopiador?: boolean;
}

/**
 * ROM sintética com cabeçalho válido.
 *
 * O que importa é o par checksum/complemento, porque é ele que o reconhecedor
 * usa — título "parece texto" dá falso positivo em dados aleatórios.
 */
function romFalsa(opcoes: OpcoesDeRomFalsa = {}): Uint8Array {
  const {
    tamanho = 0x20000,
    offsetDoCabecalho = 0x7fc0,
    titulo = 'JOGO DE TESTE',
    expoenteDeSram = 0,
    cabecalhoDeCopiador = false,
  } = opcoes;

  const desvio = cabecalhoDeCopiador ? 512 : 0;
  const bytes = new Uint8Array(tamanho + desvio);
  const base = offsetDoCabecalho + desvio;
  for (let i = 0; i < 21; i += 1) {
    bytes[base + i] = titulo.charCodeAt(i) || 0x20;
  }
  bytes[base + 0x18] = expoenteDeSram;
  const checksum = 0x1234;
  const complemento = checksum ^ 0xffff;
  bytes[base + 0x1c] = complemento & 0xff;
  bytes[base + 0x1d] = complemento >> 8;
  bytes[base + 0x1e] = checksum & 0xff;
  bytes[base + 0x1f] = checksum >> 8;
  return bytes;
}

describe('reconhecerCabecalho', () => {
  it('acha o cabeçalho LoROM', () => {
    const cabecalho = reconhecerCabecalho(romFalsa());

    expect(cabecalho).toMatchObject({
      mapeamento: 'LoROM',
      offset: 0x7fc0,
      titulo: 'JOGO DE TESTE',
    });
  });

  it('acha o cabeçalho HiROM, que é onde o Sure Instinct guarda o dele', () => {
    const cabecalho = reconhecerCabecalho(romFalsa({ offsetDoCabecalho: 0xffc0 }));

    expect(cabecalho).toMatchObject({ mapeamento: 'HiROM', offset: 0xffc0 });
  });

  it('desloca tudo quando existe cabeçalho de copiador de 512 bytes', () => {
    const cabecalho = reconhecerCabecalho(romFalsa({ cabecalhoDeCopiador: true }));

    expect(cabecalho).toMatchObject({ temCabecalhoDeCopiador: true, offset: 0x7fc0 + 512 });
  });

  it('traduz o expoente de bateria em bytes — 3 são os 8 KB do Sure Instinct', () => {
    expect(reconhecerCabecalho(romFalsa({ expoenteDeSram: 3 }))?.bytesDeSram).toBe(8192);
    expect(reconhecerCabecalho(romFalsa({ expoenteDeSram: 1 }))?.bytesDeSram).toBe(2048);
  });

  it('cartucho sem bateria declara zero, e zero não é erro', () => {
    expect(reconhecerCabecalho(romFalsa({ expoenteDeSram: 0 }))?.bytesDeSram).toBe(0);
  });

  it('recusa quando o complemento do checksum não fecha', () => {
    const bytes = romFalsa();
    bytes[0x7fc0 + 0x1e] = 0x00;

    expect(reconhecerCabecalho(bytes)).toBeNull();
  });
});

describe('triarRomDeSnes', () => {
  it('deixa passar o que parece SNES', async () => {
    await expect(triarRomDeSnes(romFromBytes(romFalsa()))).resolves.toBeUndefined();
  });

  it.each([
    ['NES', [0x4e, 0x45, 0x53, 0x1a], 0x00],
    ['ZIP', [0x50, 0x4b, 0x03, 0x04], 0x00],
  ])('recusa arquivo de %s antes de ler a ROM inteira', async (_rotulo, assinatura, offset) => {
    const bytes = romFalsa();
    bytes.set(assinatura, offset);

    await expect(triarRomDeSnes(romFromBytes(bytes))).rejects.toBeInstanceOf(RomInvalidError);
  });

  it('recusa Game Boy pela logo da Nintendo em 0x104', async () => {
    const bytes = romFalsa();
    bytes.set([0xce, 0xed, 0x66, 0x66], 0x104);

    await expect(triarRomDeSnes(romFromBytes(bytes))).rejects.toThrowError(/Game Boy/);
  });

  it('recusa arquivo vazio', async () => {
    await expect(triarRomDeSnes(romFromBytes(new Uint8Array(0)))).rejects.toBeInstanceOf(
      RomInvalidError,
    );
  });

  it('lê só o começo do Blob, sem materializar a ROM', async () => {
    const blob = new Blob([romFalsa().buffer as ArrayBuffer]);
    const espiao = vi.spyOn(blob, 'slice');

    await triarRomDeSnes(romFromBlob(blob));

    expect(espiao).toHaveBeenCalledWith(0, 1024);
  });
});

describe('lerRomDeSnes', () => {
  it('materializa os bytes e devolve identidade estável', async () => {
    const bytes = romFalsa();
    const primeira = await lerRomDeSnes(romFromBytes(bytes, { fileName: 'jogo.sfc' }));
    const segunda = await lerRomDeSnes(romFromBytes(bytes.slice(), { fileName: 'jogo.sfc' }));

    expect(primeira.romId).toBe(segunda.romId);
    expect(primeira.fileName).toBe('jogo.sfc');
    expect(primeira.bytes.byteLength).toBe(bytes.byteLength);
  });

  it('dá identidades diferentes para conteúdos diferentes', async () => {
    const a = await lerRomDeSnes(romFromBytes(romFalsa({ titulo: 'JOGO A' })));
    const b = await lerRomDeSnes(romFromBytes(romFalsa({ titulo: 'JOGO B' })));

    expect(a.romId).not.toBe(b.romId);
  });

  it('inventa um nome com extensão quando a fonte não trouxe um — o core decide pela extensão', async () => {
    const rom = await lerRomDeSnes(romFromBytes(romFalsa()));

    expect(rom.fileName).toMatch(/\.sfc$/);
  });

  it('recusa arquivo sem cabeçalho de SNES reconhecível', async () => {
    await expect(lerRomDeSnes(romFromBytes(new Uint8Array(0x20000)))).rejects.toBeInstanceOf(
      RomInvalidError,
    );
  });
});
