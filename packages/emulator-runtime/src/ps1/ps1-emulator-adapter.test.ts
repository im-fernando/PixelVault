import { afterEach, expect, it, vi } from 'vitest';
import { Nostalgist } from 'nostalgist';
import { Ps1EmulatorAdapter } from './ps1-emulator-adapter.js';
import { lerRomDePs1 } from './ps1-rom.js';
import { romFromBytes, romFromBlob } from '../adapter/rom-source.js';
import { empacotarEstado } from '../snes/state-envelope.js';

vi.mock('nostalgist', () => ({
  Nostalgist: {
    prepare: vi.fn(async () => ({
      start: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      exit: vi.fn(),
      getEmscripten: vi.fn(() => ({})),
    })),
  },
}));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});
function rom() {
  const b = new Uint8Array(4096);
  b.set(new TextEncoder().encode('PS-X EXE'));
  const v = new DataView(b.buffer);
  v.setUint32(16, 0x80010000, true);
  v.setUint32(24, 0x80010000, true);
  v.setUint32(28, 2048, true);
  return b;
}
async function montar() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([0]))),
  );
  const bios = { fileName: 'scph5501.bin', fileContent: new Uint8Array(512 * 1024) };
  const a = new Ps1EmulatorAdapter({ bios: async () => bios });
  await a.mount({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement);
  await a.loadGame(romFromBytes(rom(), { fileName: 'teste.exe' }));
  return { a, bios };
}
it('materializa conteúdo em Blob e mantém identidade por bytes entre fontes', async () => {
  const b = rom();
  const a = await lerRomDePs1(romFromBytes(b, { fileName: 'x.exe' }));
  const outro = await lerRomDePs1(romFromBlob(new Blob([b]), { fileName: 'outro.exe' }));
  expect(a.bytes).toBeInstanceOf(Blob);
  expect(a.romId).toBe(outro.romId);
  b[3000] = 1;
  expect((await lerRomDePs1(romFromBytes(b, { fileName: 'x.exe' }))).romId).not.toBe(a.romId);
});
it('configura BIOS, controle digital, L2/R2 e memory card individual', async () => {
  const { a, bios } = await montar();
  expect(a.systemId).toBe('ps1');
  expect(a.coreVersion).toBe('pcsx_rearmed@1.22.2');
  expect(a.capabilities.memoryRead).toBe(false);
  expect(Nostalgist.prepare).toHaveBeenCalledWith(
    expect.objectContaining({
      bios,
      core: expect.objectContaining({ name: 'pcsx_rearmed' }),
      rom: expect.objectContaining({ fileContent: expect.any(Blob) }),
      retroarchCoreConfig: expect.objectContaining({ pcsx_rearmed_memcard2: 'disabled' }),
      retroarchConfig: expect.objectContaining({
        input_player1_l2: 'e',
        input_player1_r2: 'r',
        input_libretro_device_p1: 1,
      }),
    }),
  );
  await a.destroy();
});
it('recusa memory card de outro formato antes de reconstruir o core', async () => {
  const { a } = await montar();
  await expect(a.importSram(new Uint8Array(8192))).rejects.toThrow('Memory card PS1');
  expect(Nostalgist.prepare).toHaveBeenCalledTimes(1);
  await a.destroy();
});
it('recusa save state de outro sistema, core ou jogo', async () => {
  const { a } = await montar();
  await a.start();
  try {
    for (const dados of [
      { systemId: 'snes', coreVersion: a.coreVersion, romId: 'outro' },
      { systemId: 'ps1', coreVersion: 'outro', romId: 'outro' },
      { systemId: 'ps1', coreVersion: a.coreVersion, romId: 'outro' },
    ])
      await expect(
        a.importState(empacotarEstado({ ...dados, estado: new Uint8Array([1]) })),
      ).rejects.toThrow();
  } finally {
    await a.destroy();
  }
});

it('recusa a falha silenciosa de boot do RetroArch e libera o core substituto', async () => {
  const exit = vi.fn();
  vi.mocked(Nostalgist.prepare).mockImplementationOnce(
    async (options) =>
      ({
        start: async () => {
          const modulo = options.emscriptenModule as { printErr: (message: string) => void };
          modulo.printErr('[ERROR] [Content] Failed to load content.');
        },
        exit,
      }) as unknown as Nostalgist,
  );
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  const { a } = await montar();
  try {
    await expect(a.start()).rejects.toThrow('O core não conseguiu abrir este disco');
    expect(a.status).toBe('mounted');
    expect(exit).toHaveBeenCalledOnce();
  } finally {
    await a.destroy();
    consoleError.mockRestore();
  }
});
