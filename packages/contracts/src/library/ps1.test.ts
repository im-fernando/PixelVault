import { describe, expect, it } from 'vitest';
import { erroNaImagemPs1, TAMANHO_MAXIMO_DE_PS1_EM_BYTES } from './ps1.js';

function exe() {
  const b = new Uint8Array(4096);
  b.set([...'PS-X EXE'].map((c) => c.charCodeAt(0)));
  const v = new DataView(b.buffer);
  v.setUint32(16, 0x80010000, true);
  v.setUint32(24, 0x80010000, true);
  v.setUint32(28, 2048, true);
  return b;
}
function chd() {
  const b = new Uint8Array(1024);
  b.set([...'MComprHD'].map((c) => c.charCodeAt(0)));
  const v = new DataView(b.buffer);
  v.setUint32(8, 124);
  v.setUint32(12, 5);
  v.setBigUint64(32, 24480n);
  v.setBigUint64(40, 128n);
  v.setUint32(56, 2448 * 8);
  v.setUint32(60, 2448);
  return b;
}
function iso() {
  const b = new Uint8Array(40 * 2048);
  const v = new DataView(b.buffer);
  b[32768] = 1;
  b.set(
    [...'CD001'].map((c) => c.charCodeAt(0)),
    32769,
  );
  b[32774] = 1;
  b.set(
    [...'PLAYSTATION'].map((c) => c.charCodeAt(0)),
    32776,
  );
  v.setUint32(32848, 40, true);
  return b;
}

describe('formatos da primeira versão de PS1', () => {
  it.each([
    ['pixel.EXE', exe],
    ['disco.chd', chd],
    ['disco.iso', iso],
  ])('aceita %s com estrutura válida', (nome, criar) => {
    const b = criar();
    expect(erroNaImagemPs1(b.subarray(0, 65536), b.length, nome)).toBeNull();
  });
  it.each(['disco.pbp', 'disco.cue', 'disco.bin', 'discos.m3u'])(
    'recusa %s com orientação',
    (nome) => {
      expect(erroNaImagemPs1(exe(), 4096, nome)).toContain('Converta BIN/CUE');
    },
  );
  it('recusa EXE de PC e homebrew truncado', () => {
    expect(erroNaImagemPs1(new Uint8Array(4096), 4096, 'x.exe')).toContain('PS-X EXE');
    expect(erroNaImagemPs1(exe(), 3000, 'x.exe')).toContain('truncado');
  });
  it('recusa CHD de HD, diferencial, antigo e mapa fora do arquivo', () => {
    for (const mudar of [
      (v: DataView) => v.setUint32(60, 512),
      (v: DataView) => v.setUint32(12, 4),
      (v: DataView) => v.setUint8(104, 1),
      (v: DataView) => v.setBigUint64(40, 9999n),
    ]) {
      const b = chd();
      mudar(new DataView(b.buffer));
      expect(erroNaImagemPs1(b, b.length, 'x.chd')).not.toBeNull();
    }
  });
  it('recusa ISO de outro sistema ou truncada', () => {
    const b = iso();
    b[32776] = 0;
    expect(erroNaImagemPs1(b, b.length, 'x.iso')).toContain('PlayStation');
    expect(erroNaImagemPs1(iso(), 20 * 2048, 'x.iso')).toContain('truncada');
  });
  it('aplica o limite antes de processar um disco', () => {
    expect(erroNaImagemPs1(chd(), TAMANHO_MAXIMO_DE_PS1_EM_BYTES + 1, 'x.chd')).toContain('1 GiB');
  });
});
