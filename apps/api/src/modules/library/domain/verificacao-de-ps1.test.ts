import { expect, it } from 'vitest';
import { sistemaPelaExtensao, verificarRom, verificarPs1EmPartes } from './verificacao-de-rom.js';
function exe() {
  const b = new Uint8Array(4096);
  b.set(new TextEncoder().encode('PS-X EXE'));
  const v = new DataView(b.buffer);
  v.setUint32(16, 0x80010000, true);
  v.setUint32(24, 0x80010000, true);
  v.setUint32(28, 2048, true);
  return b;
}
it('identifica formatos PS1 sem roubar BIN do Mega Drive', () => {
  expect(sistemaPelaExtensao('jogo.bin')).toBe('genesis');
  for (const ext of ['chd', 'iso', 'exe']) expect(sistemaPelaExtensao(`jogo.${ext}`)).toBe('ps1');
});
it('stream de chunks pequenos produz os mesmos hashes e metadados da leitura inteira', async () => {
  const b = exe();
  async function* partes() {
    for (let i = 0; i < b.length; i += 13) yield b.subarray(i, i + 13);
  }
  expect(await verificarPs1EmPartes(partes(), 'homebrew.exe')).toEqual(
    verificarRom(b, 'homebrew.exe'),
  );
});
it('recusa executável de PC e disco truncado também por stream', async () => {
  const b = exe();
  b[0] = 0x4d;
  b[1] = 0x5a;
  async function* partes() {
    yield b;
  }
  await expect(verificarPs1EmPartes(partes(), 'programa.exe')).rejects.toThrow();
  expect(() => verificarRom(exe().slice(0, 3000), 'homebrew.exe')).toThrow();
});
