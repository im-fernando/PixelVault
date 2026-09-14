/** Homebrew MIT do próprio projeto. MIPS R3000: configura GPU e anima a cor da tela.
 * Não inclui SDK, jogo ou BIOS de terceiros. Layout: psx-spx/CDROM File Formats.
 */
export function criarHomebrewPs1() {
  const code = [];
  const emit = (word) => code.push(word >>> 0);
  const lui = (r, n) => emit(0x3c000000 | (r << 16) | n);
  const ori = (d, s, n) => emit(0x34000000 | (s << 21) | (d << 16) | n);
  const sw = (r, offset, base) => emit(0xac000000 | (base << 21) | (r << 16) | offset);
  const li = (r, n) => {
    lui(r, n >>> 16);
    ori(r, r, n & 65535);
  };
  const sh = (r, offset, base) => emit(0xa4000000 | (base << 21) | (r << 16) | offset);
  const esperar = (ciclos) => {
    li(11, ciclos);
    const inicio = code.length;
    emit(0x256bffff);
    emit(0x15600000 | ((inicio - code.length - 1) & 65535));
    emit(0);
  };
  // Onda ADPCM da própria fixture: sem samples/SDK de terceiros.
  li(8, 0x1f801c00);
  for (const [offset, valor] of [
    [0x1aa, 0xc000],
    [0x1ac, 4],
    [0x1a6, 0x200],
  ]) {
    li(9, valor);
    sh(9, offset, 8);
  }
  for (let i = 0; i < 32; i++) {
    li(9, i % 8 === 0 ? 0x0300 : i % 2 ? 0x7777 : 0x9999);
    sh(9, 0x1a8, 8);
  }
  li(9, 0xc010);
  sh(9, 0x1aa, 8);
  esperar(10000);
  for (const [offset, valor] of [
    [0x1aa, 0xc000],
    [0x180, 0x3fff],
    [0x182, 0x3fff],
    [0, 0x3fff],
    [2, 0x3fff],
    [4, 0x1000],
    [6, 0x200],
    [14, 0x200],
    [8, 0x000f],
    [10, 0],
    [0x194, 0],
    [0x1aa, 0xc000], // SPU enabled/unmuted
    [0x188, 1], // key on voice 0
  ]) {
    li(9, valor);
    sh(9, offset, 8);
  }
  esperar(10000);
  li(8, 0x1f801810); // GP0/GP1
  sw(0, 4, 8); // reset GPU
  for (const cmd of [0x03000000, 0x08000001, 0x06c60260, 0x07042018, 0x05000000]) {
    li(9, cmd);
    sw(9, 4, 8);
  }
  li(10, 0x020000ff); // fill rectangle, initial red
  const loop = code.length;
  sw(10, 0, 8);
  sw(0, 0, 8);
  li(9, 0x00f00140);
  sw(9, 0, 8);
  li(11, 100000);
  const delay = code.length;
  emit(0x256bffff); // addiu t3,t3,-1
  emit(0x15600000 | ((delay - code.length - 1) & 65535));
  emit(0); // bne t3,zero,delay
  emit(0x254a0100); // addiu t2,t2,0x100 (green)
  emit(0x08000000 | (((0x80010000 + loop * 4) >>> 2) & 0x03ffffff));
  emit(0);
  const bytes = new Uint8Array(4096);
  bytes.set(new TextEncoder().encode('PS-X EXE'));
  const v = new DataView(bytes.buffer);
  v.setUint32(0x10, 0x80010000, true);
  v.setUint32(0x18, 0x80010000, true);
  v.setUint32(0x1c, 2048, true);
  v.setUint32(0x30, 0x801fff00, true);
  code.forEach((word, i) => v.setUint32(2048 + i * 4, word, true));
  return bytes;
}
