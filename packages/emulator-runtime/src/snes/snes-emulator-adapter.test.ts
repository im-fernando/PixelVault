import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CapabilityUnsupportedError,
  CoreLoadError,
  EmulatorLifecycleError,
  RomInvalidError,
} from '../adapter/errors.js';
import { romFromBytes } from '../adapter/rom-source.js';
import type { EmulatorStatus } from '../adapter/status.js';
import { EmulatorRegistry } from '../registry/registry.js';
import { VERSAO_DO_CORE, assetsDoCoreDeSnes } from './core-assets.js';
import { registrarAdapterDeSnes } from './register.js';
import { SnesEmulatorAdapter, interpretarLeitura } from './snes-emulator-adapter.js';

/**
 * O adapter só toca o canvas para escutar perda de contexto WebGL; nada aqui
 * desenha. Um duplo com os dois métodos é tudo que o ciclo de vida exercita
 * sem navegador.
 */
function canvasFalso(): HTMLCanvasElement {
  return {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  } as unknown as HTMLCanvasElement;
}

function romValida(): Uint8Array {
  const bytes = new Uint8Array(0x20000);
  const base = 0x7fc0;
  for (let i = 0; i < 21; i += 1) {
    bytes[base + i] = 0x41;
  }
  bytes[base + 0x1c] = 0xcb;
  bytes[base + 0x1d] = 0xed;
  bytes[base + 0x1e] = 0x34;
  bytes[base + 0x1f] = 0x12;
  return bytes;
}

function fingirDownloadDoCore(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.resolve(new Response(new Uint8Array([0])))),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('SnesEmulatorAdapter — identidade', () => {
  it('declara console e core, com versão', () => {
    const adapter = new SnesEmulatorAdapter();

    expect(adapter.systemId).toBe('snes');
    expect(adapter.coreVersion).toBe(VERSAO_DO_CORE);
    expect(adapter.coreVersion).toContain('snes9x2010');
    expect(adapter.coreVersion).toContain('1.22.2');
  });

  it('declara só o que o snes9x2010 entrega', () => {
    expect(new SnesEmulatorAdapter().capabilities).toEqual({
      saveState: true,
      sram: true,
      memoryRead: true,
      rewind: false,
      cheats: false,
      netplay: false,
    });
  });

  it('começa em idle, sem canvas e sem ROM', () => {
    const adapter = new SnesEmulatorAdapter();

    expect(adapter.status).toBe('idle');
    expect(adapter.romHeader).toBeNull();
  });
});

describe('SnesEmulatorAdapter — ciclo de vida', () => {
  it('recusa operação fora de ordem com erro de ciclo de vida', async () => {
    const adapter = new SnesEmulatorAdapter();

    await expect(adapter.start()).rejects.toBeInstanceOf(EmulatorLifecycleError);
    await expect(adapter.loadGame(romFromBytes(romValida()))).rejects.toBeInstanceOf(
      EmulatorLifecycleError,
    );
    expect(() => {
      adapter.pause();
    }).toThrowError(EmulatorLifecycleError);
    expect(() => {
      adapter.reset();
    }).toThrowError(EmulatorLifecycleError);
    await expect(adapter.exportState()).rejects.toBeInstanceOf(EmulatorLifecycleError);
    await expect(adapter.captureFrame()).rejects.toBeInstanceOf(EmulatorLifecycleError);
  });

  it('baixa os assets do core no mount e anuncia as transições', async () => {
    fingirDownloadDoCore();
    const adapter = new SnesEmulatorAdapter();
    const transicoes: EmulatorStatus[] = [];
    adapter.on('statusChange', ({ current }) => transicoes.push(current));

    await adapter.mount(canvasFalso());

    expect(adapter.status).toBe('mounted');
    expect(transicoes).toEqual(['loading', 'mounted']);
    const assets = assetsDoCoreDeSnes();
    expect(fetch).toHaveBeenCalledWith(assets.urlDoJs);
    expect(fetch).toHaveBeenCalledWith(assets.urlDoWasm);
  });

  it('honra a base de assets configurada — o caminho é versionado por causa do save state', async () => {
    fingirDownloadDoCore();
    const adapter = new SnesEmulatorAdapter({ assetsBaseUrl: 'https://cdn.exemplo.test/emu/' });

    await adapter.mount(canvasFalso());

    expect(fetch).toHaveBeenCalledWith(
      'https://cdn.exemplo.test/emu/snes9x2010/1.22.2/snes9x2010_libretro.js',
    );
  });

  it('falha de rede no mount vira CoreLoadError e volta para idle', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response(null, { status: 404 }))),
    );
    const adapter = new SnesEmulatorAdapter();

    await expect(adapter.mount(canvasFalso())).rejects.toBeInstanceOf(CoreLoadError);
    expect(adapter.status).toBe('idle');
  });

  it('escuta perda de contexto WebGL no canvas e para de escutar no destroy', async () => {
    fingirDownloadDoCore();
    const canvas = canvasFalso();
    const adapter = new SnesEmulatorAdapter();

    await adapter.mount(canvas);
    expect(canvas.addEventListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));

    await adapter.destroy();
    expect(canvas.removeEventListener).toHaveBeenCalledWith(
      'webglcontextlost',
      expect.any(Function),
    );
  });

  it('ROM de outro console não chega no core: volta para mounted', async () => {
    fingirDownloadDoCore();
    const adapter = new SnesEmulatorAdapter();
    await adapter.mount(canvasFalso());

    const nes = new Uint8Array(0x20000);
    nes.set([0x4e, 0x45, 0x53, 0x1a], 0);

    await expect(
      adapter.loadGame(romFromBytes(nes, { fileName: 'jogo.nes' })),
    ).rejects.toBeInstanceOf(RomInvalidError);
    expect(adapter.status).toBe('mounted');
  });

  it('destroy é idempotente e deixa tudo em destroyed', async () => {
    fingirDownloadDoCore();
    const adapter = new SnesEmulatorAdapter();
    await adapter.mount(canvasFalso());

    await adapter.destroy();
    await adapter.destroy();

    expect(adapter.status).toBe('destroyed');
    await expect(adapter.loadGame(romFromBytes(romValida()))).rejects.toBeInstanceOf(
      EmulatorLifecycleError,
    );
  });
});

describe('interpretarLeitura', () => {
  it('lê os bytes que o RetroArch devolve em hexadecimal', () => {
    expect(interpretarLeitura('READ_CORE_MEMORY 7e0000 09 5F 00 7F')).toEqual(
      new Uint8Array([0x09, 0x5f, 0x00, 0x7f]),
    );
  });

  it('traduz "no memory map defined" em capacidade não suportada', () => {
    // É literalmente a resposta que reprovou o `snes9x` no spike da ADR 0008.
    expect(() =>
      interpretarLeitura('READ_CORE_MEMORY 7e0000 -1 no memory map defined'),
    ).toThrowError(CapabilityUnsupportedError);
  });

  it('recusa resposta ilegível em vez de devolver zeros', () => {
    expect(() => interpretarLeitura('READ_CORE_MEMORY 7e0000 ZZ')).toThrowError(CoreLoadError);
  });
});

describe('registrarAdapterDeSnes', () => {
  it('coloca o adapter no registry sob "snes"', async () => {
    const registry = new EmulatorRegistry();
    registrarAdapterDeSnes(registry);

    expect(registry.supportedSystems()).toEqual(['snes']);
    const adapter = await registry.create('snes');
    expect(adapter).toBeInstanceOf(SnesEmulatorAdapter);
    expect(adapter.coreVersion).toBe(VERSAO_DO_CORE);
  });

  it('repassa as opções para cada adapter criado', async () => {
    fingirDownloadDoCore();
    const registry = new EmulatorRegistry();
    registrarAdapterDeSnes(registry, { assetsBaseUrl: '/estatico/emu' });

    await (await registry.create('snes')).mount(canvasFalso());

    expect(fetch).toHaveBeenCalledWith('/estatico/emu/snes9x2010/1.22.2/snes9x2010_libretro.js');
  });
});
