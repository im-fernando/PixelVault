import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CapabilityUnsupportedError,
  CoreLoadError,
  EmulatorError,
  EmulatorLifecycleError,
  RomInvalidError,
  StateIncompatibleError,
} from '../adapter/errors.js';
import type { EmulatorStatus } from '../adapter/status.js';
import { romFromBlob, romFromBytes, romFromUrl } from '../adapter/rom-source.js';
import { FakeAdapter, type FakeAdapterOptions } from './fake-adapter.js';

/** O falso nunca desenha; o canvas só precisa existir para o teste conferir a ligação. */
const canvas = {} as HTMLCanvasElement;

const ZELDA = romFromBytes(new Uint8Array([0x5a, 0x45, 0x4c, 0x44, 0x41, 1, 2, 3]), {
  fileName: 'zelda.sfc',
});
const METROID = romFromBytes(new Uint8Array([0x4d, 0x45, 0x54, 0x52, 0x4f, 9, 9, 9]), {
  fileName: 'metroid.sfc',
});

async function adapterRodando(opcoes: FakeAdapterOptions = {}): Promise<FakeAdapter> {
  const adapter = new FakeAdapter(opcoes);
  await adapter.mount(canvas);
  await adapter.loadGame(ZELDA);
  await adapter.start();
  return adapter;
}

describe('FakeAdapter — ciclo de vida', () => {
  it('sai de idle e atravessa mount, load, start, pause e resume', async () => {
    const adapter = new FakeAdapter();
    expect(adapter.status).toBe('idle');

    await adapter.mount(canvas);
    expect(adapter.status).toBe('mounted');
    expect(adapter.canvas).toBe(canvas);

    await adapter.loadGame(ZELDA);
    expect(adapter.status).toBe('ready');

    await adapter.start();
    expect(adapter.status).toBe('running');

    adapter.pause();
    expect(adapter.status).toBe('paused');

    adapter.resume();
    expect(adapter.status).toBe('running');

    await adapter.destroy();
    expect(adapter.status).toBe('destroyed');
  });

  it('anuncia cada transição em statusChange', async () => {
    const adapter = new FakeAdapter();
    const transicoes: EmulatorStatus[] = [];
    adapter.on('statusChange', ({ current }) => transicoes.push(current));

    await adapter.mount(canvas);
    await adapter.loadGame(ZELDA);
    await adapter.start();
    adapter.pause();

    expect(transicoes).toEqual(['mounted', 'loading', 'ready', 'running', 'paused']);
  });

  it('emite ready com a identidade do core', async () => {
    const adapter = new FakeAdapter({ systemId: 'gb', coreVersion: 'fake-2.0.0' });
    const ouvinte = vi.fn();
    adapter.on('ready', ouvinte);

    await adapter.mount(canvas);
    await adapter.loadGame(ZELDA);

    expect(ouvinte).toHaveBeenCalledWith({ systemId: 'gb', coreVersion: 'fake-2.0.0' });
  });

  it('recusa operação fora de ordem com código estável', async () => {
    const adapter = new FakeAdapter();

    await expect(adapter.start()).rejects.toBeInstanceOf(EmulatorLifecycleError);
    await expect(adapter.loadGame(ZELDA)).rejects.toMatchObject({ code: 'INVALID_LIFECYCLE' });
    expect(() => adapter.pause()).toThrowError(EmulatorLifecycleError);

    await adapter.mount(canvas);
    await expect(adapter.mount(canvas)).rejects.toBeInstanceOf(EmulatorLifecycleError);
  });

  it('depois de destroy tudo é erro de ciclo de vida', async () => {
    const adapter = await adapterRodando();
    await adapter.destroy();

    await expect(adapter.exportState()).rejects.toBeInstanceOf(EmulatorLifecycleError);
    await expect(adapter.loadGame(ZELDA)).rejects.toBeInstanceOf(EmulatorLifecycleError);
    expect(adapter.canvas).toBeNull();
  });

  it('destroy é idempotente e solta os ouvintes', async () => {
    const adapter = await adapterRodando();
    const ouvinte = vi.fn();
    adapter.on('statusChange', ouvinte);

    await adapter.destroy();
    await adapter.destroy();

    expect(ouvinte).toHaveBeenCalledTimes(1);
  });

  it('permite trocar de jogo sem remontar', async () => {
    const adapter = await adapterRodando();

    await adapter.loadGame(METROID);

    expect(adapter.status).toBe('ready');
    expect(adapter.frameCount).toBe(0);
  });
});

describe('FakeAdapter — carga da ROM', () => {
  it('aceita as três origens de RomSource', async () => {
    const doBlob = new FakeAdapter();
    await doBlob.mount(canvas);
    await doBlob.loadGame(romFromBlob(new Blob([new Uint8Array([1, 2, 3, 4])])));
    expect(doBlob.status).toBe('ready');

    // URL não é buscada: teste de player não pode depender de servidor no ar.
    const daUrl = new FakeAdapter();
    await daUrl.mount(canvas);
    await daUrl.loadGame(romFromUrl('https://exemplo.test/jogo.sfc'));
    const deOutraUrl = new FakeAdapter();
    await deOutraUrl.mount(canvas);
    await deOutraUrl.loadGame(romFromUrl('https://exemplo.test/outro.sfc'));

    expect(daUrl.status).toBe('ready');
    expect(daUrl.romId).toMatch(/^url:/);
    expect(daUrl.romId).not.toBe(deOutraUrl.romId);
  });

  it('recusa arquivo vazio', async () => {
    const adapter = new FakeAdapter();
    await adapter.mount(canvas);

    await expect(adapter.loadGame(romFromBytes(new Uint8Array(0)))).rejects.toBeInstanceOf(
      RomInvalidError,
    );
    expect(adapter.status).toBe('mounted');
    expect(adapter.romId).toBeNull();
  });

  it('injeta falha de core em mount', async () => {
    const adapter = new FakeAdapter({ failures: { mount: true } });

    await expect(adapter.mount(canvas)).rejects.toBeInstanceOf(CoreLoadError);
    expect(adapter.status).toBe('idle');
  });

  it('injeta falha de ROM e volta para mounted', async () => {
    const adapter = new FakeAdapter({ failures: { loadGame: true } });
    await adapter.mount(canvas);

    await expect(adapter.loadGame(ZELDA)).rejects.toMatchObject({ code: 'ROM_INVALID' });
    expect(adapter.status).toBe('mounted');
  });
});

describe('FakeAdapter — capabilities', () => {
  it('liga saveState e sram por padrão e deixa o resto desligado', () => {
    expect(new FakeAdapter().capabilities).toEqual({
      saveState: true,
      sram: true,
      rewind: false,
      memoryRead: false,
      cheats: false,
      netplay: false,
    });
  });

  it('recusa a operação que a capability nega, antes de qualquer outra checagem', async () => {
    const semSave = await adapterRodando({ capabilities: { sram: true } });
    const semSram = await adapterRodando({ capabilities: { saveState: true } });

    await expect(semSave.exportState()).rejects.toBeInstanceOf(CapabilityUnsupportedError);
    await expect(semSave.importState(new Uint8Array(32))).rejects.toMatchObject({
      code: 'CAPABILITY_UNSUPPORTED',
    });
    await expect(semSram.exportSram()).rejects.toBeInstanceOf(CapabilityUnsupportedError);
  });
});

describe('FakeAdapter — SRAM', () => {
  it('é determinística: a mesma ROM dá sempre os mesmos bytes', async () => {
    const primeiro = await adapterRodando();
    const segundo = await adapterRodando();

    expect(await primeiro.exportSram()).toEqual(await segundo.exportSram());
  });

  it('difere entre ROMs diferentes', async () => {
    const zelda = await adapterRodando();
    const metroid = new FakeAdapter();
    await metroid.mount(canvas);
    await metroid.loadGame(METROID);

    expect(await zelda.exportSram()).not.toEqual(await metroid.exportSram());
  });

  it('faz round-trip byte a byte', async () => {
    const adapter = await adapterRodando();
    const gravado = new Uint8Array([9, 8, 7, 6, 5]);

    await adapter.importSram(gravado);

    expect(await adapter.exportSram()).toEqual(gravado);
  });

  it('exporta cópia, nunca a janela viva sobre a memória do core', async () => {
    const adapter = await adapterRodando();
    const exportado = await adapter.exportSram();

    exportado.fill(0);

    expect(await adapter.exportSram()).not.toEqual(exportado);
  });

  it('avisa quando o jogo grava na bateria', async () => {
    const adapter = await adapterRodando();
    const ouvinte = vi.fn();
    adapter.on('sramChange', ouvinte);

    adapter.advanceFrames(59);
    expect(ouvinte).not.toHaveBeenCalled();

    adapter.advanceFrames(1);
    expect(ouvinte).toHaveBeenCalledWith({ byteLength: 64 });
  });

  it('reset volta a máquina ao quadro zero e à SRAM inicial', async () => {
    const adapter = await adapterRodando();
    const inicial = await adapter.exportSram();
    adapter.advanceFrames(300);

    adapter.reset();

    expect(adapter.frameCount).toBe(0);
    expect(adapter.status).toBe('running');
    expect(await adapter.exportSram()).toEqual(inicial);
  });
});

describe('FakeAdapter — save state', () => {
  it('faz round-trip do quadro e da SRAM', async () => {
    const adapter = await adapterRodando();
    adapter.advanceFrames(120);
    const estado = await adapter.exportState();
    const sramNoMomentoDoSave = await adapter.exportSram();

    adapter.advanceFrames(240);
    expect(adapter.frameCount).toBe(360);

    await adapter.importState(estado);

    expect(adapter.frameCount).toBe(120);
    expect(await adapter.exportSram()).toEqual(sramNoMomentoDoSave);
  });

  it('atravessa instâncias — é o caso real de sincronizar entre dispositivos', async () => {
    const naOrigem = await adapterRodando();
    naOrigem.advanceFrames(180);
    const estado = await naOrigem.exportState();

    const noDestino = await adapterRodando();
    await noDestino.importState(estado);

    expect(noDestino.frameCount).toBe(180);
    expect(await noDestino.exportSram()).toEqual(await naOrigem.exportSram());
  });

  it('é determinístico: mesma partida, mesmos bytes', async () => {
    const primeiro = await adapterRodando();
    const segundo = await adapterRodando();
    primeiro.advanceFrames(120);
    segundo.advanceFrames(120);

    expect(await primeiro.exportState()).toEqual(await segundo.exportState());
  });

  it('recusa save state de outra versão do core', async () => {
    const antigo = await adapterRodando({ coreVersion: 'fake-1.0.0' });
    const novo = await adapterRodando({ coreVersion: 'fake-2.0.0' });

    await expect(novo.importState(await antigo.exportState())).rejects.toMatchObject({
      code: 'STATE_INCOMPATIBLE',
    });
  });

  it('recusa save state de outro console', async () => {
    const doSnes = await adapterRodando({ systemId: 'snes' });
    const doGb = new FakeAdapter({ systemId: 'gb' });
    await doGb.mount(canvas);
    await doGb.loadGame(ZELDA);

    await expect(doGb.importState(await doSnes.exportState())).rejects.toBeInstanceOf(
      StateIncompatibleError,
    );
  });

  it('recusa save state de outra ROM', async () => {
    const zelda = await adapterRodando();
    const outro = new FakeAdapter();
    await outro.mount(canvas);
    await outro.loadGame(METROID);

    await expect(outro.importState(await zelda.exportState())).rejects.toMatchObject({
      reason: 'save state de outra ROM',
    });
  });

  it('recusa lixo e arquivo truncado', async () => {
    const adapter = await adapterRodando();

    await expect(adapter.importState(new Uint8Array([1, 2, 3]))).rejects.toBeInstanceOf(
      StateIncompatibleError,
    );
    await expect(adapter.importState(new Uint8Array(64))).rejects.toBeInstanceOf(
      StateIncompatibleError,
    );
    await expect(
      adapter.importState((await adapter.exportState()).slice(0, 20)),
    ).rejects.toBeInstanceOf(StateIncompatibleError);
  });

  it('injeta falha de incompatibilidade', async () => {
    const adapter = await adapterRodando({ failures: { importState: true } });

    await expect(adapter.importState(await adapter.exportState())).rejects.toBeInstanceOf(
      StateIncompatibleError,
    );
  });
});

describe('FakeAdapter — quadro e eventos', () => {
  let adapter: FakeAdapter;

  beforeEach(async () => {
    adapter = await adapterRodando();
  });

  it('só avança o relógio quando mandam', () => {
    expect(adapter.frameCount).toBe(0);
    adapter.advanceFrames(3);
    expect(adapter.frameCount).toBe(3);
  });

  it('amostra fps sem emitir por quadro', () => {
    const ouvinte = vi.fn();
    adapter.on('fps', ouvinte);

    adapter.advanceFrames(120);

    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(ouvinte).toHaveBeenCalledWith({ fps: 60 });
  });

  it('captura o quadro como imagem determinística', async () => {
    adapter.advanceFrames(42);
    const imagem = await adapter.captureFrame();

    expect(imagem.type).toBe('image/svg+xml');
    await expect(imagem.text()).resolves.toContain('snes #42');
  });

  it('emite falha assíncrona para a tela de erro', () => {
    const ouvinte = vi.fn();
    adapter.on('error', ouvinte);
    const falha = new EmulatorError('CORE_LOAD_FAILED', 'contexto WebGL perdido');

    adapter.emitError(falha);

    expect(ouvinte).toHaveBeenCalledWith({ error: falha });
  });

  it('cancela a inscrição pelo retorno de on', () => {
    const ouvinte = vi.fn();
    const cancelar = adapter.on('fps', ouvinte);

    cancelar();
    adapter.advanceFrames(1);

    expect(ouvinte).not.toHaveBeenCalled();
  });
});
