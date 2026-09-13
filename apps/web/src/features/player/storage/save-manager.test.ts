import { romFromBytes } from '@pixelvault/emulator-runtime';
import { FakeAdapter, type FakeAdapterOptions } from '@pixelvault/emulator-runtime/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SaveCapabilityUnsupportedError,
  SaveIncompatibleError,
  SaveNotFoundError,
  SaveQuotaExceededError,
  isSaveStorageError,
} from './errors.js';
import { MemorySaveStorage } from './memory-save-storage.js';
import { SaveManager } from './save-manager.js';
import type { SaveStorage } from './save-storage.js';
import { THUMBNAIL_PLACEHOLDER, thumbnailUrl } from './thumbnail.js';

/** O falso nunca desenha; o canvas só precisa existir. */
const canvas = {} as HTMLCanvasElement;
const ZELDA = romFromBytes(new Uint8Array([0x5a, 0x45, 0x4c, 0x44, 0x41, 1, 2, 3]), {
  fileName: 'zelda.sfc',
});
const ROM_ID = 'c'.repeat(64);
const DEBOUNCE_MS = 50;

async function adapterRodando(opcoes: FakeAdapterOptions = {}): Promise<FakeAdapter> {
  const adapter = new FakeAdapter(opcoes);
  await adapter.mount(canvas);
  await adapter.loadGame(ZELDA);
  await adapter.start();
  return adapter;
}

function gerenciador(
  emulator: FakeAdapter,
  storage: SaveStorage,
  extras: Partial<ConstructorParameters<typeof SaveManager>[0]> = {},
): SaveManager {
  return new SaveManager({
    emulator,
    storage,
    romId: ROM_ID,
    sramDebounceMs: DEBOUNCE_MS,
    now: () => 1_700_000_000_000,
    ...extras,
  });
}

describe('SaveManager — SRAM', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * O critério de aceite da issue #22, em um teste: joga, o jogo salva, a aba
   * fecha, a aba reabre, o progresso está lá.
   */
  it('sobrevive a fechar e reabrir a aba', async () => {
    const storage = new MemorySaveStorage();

    const primeiraSessao = await adapterRodando();
    const saves = gerenciador(primeiraSessao, storage);
    saves.watchSram();
    primeiraSessao.advanceFrames(180);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const sramJogada = await primeiraSessao.exportSram();
    await saves.dispose();
    await primeiraSessao.destroy();

    // Aba nova: adapter novo, mesmo storage, mesma ROM.
    const segundaSessao = await adapterRodando();
    expect(await segundaSessao.exportSram()).not.toEqual(sramJogada);

    const savesDaVolta = gerenciador(segundaSessao, storage);
    const metadata = await savesDaVolta.restoreSram();

    expect(metadata?.kind).toBe('sram');
    expect(await segundaSessao.exportSram()).toEqual(sramJogada);
  });

  it('grava só depois do debounce, e uma vez só por rajada', async () => {
    const storage = new MemorySaveStorage();
    const gravar = vi.spyOn(storage, 'write');
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();

    adapter.advanceFrames(60);
    adapter.advanceFrames(60);
    adapter.advanceFrames(60);
    expect(gravar).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(gravar).toHaveBeenCalledTimes(1);
  });

  it('não regrava bytes idênticos aos já gravados', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();

    adapter.advanceFrames(60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    const gravar = vi.spyOn(storage, 'write');

    // `importSram` emite `sramChange` com o mesmo conteúdo que já está gravado.
    await adapter.importSram(await adapter.exportSram());
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);
    expect(gravar).not.toHaveBeenCalled();
  });

  it('grava o pendente ao descartar, sem esperar o debounce', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();

    adapter.advanceFrames(60);
    await saves.dispose();

    expect((await storage.read({ kind: 'sram', romId: ROM_ID }))?.data).toEqual(
      await adapter.exportSram(),
    );
  });

  it('para de agendar gravação depois do descarte', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();
    await saves.dispose();

    const gravar = vi.spyOn(storage, 'write');
    adapter.advanceFrames(60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS * 4);
    expect(gravar).not.toHaveBeenCalled();
  });

  it('manda a falha do save automático para onError, sem derrubar a emulação', async () => {
    const storage = new MemorySaveStorage({ maxBytes: 4 });
    const adapter = await adapterRodando();
    const onError = vi.fn();
    const saves = gerenciador(adapter, storage, { onError });
    saves.watchSram();

    adapter.advanceFrames(60);
    await vi.advanceTimersByTimeAsync(DEBOUNCE_MS);

    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0]?.[0]).toBeInstanceOf(SaveQuotaExceededError);
    expect(adapter.status).toBe('running');
  });

  it('restaura null quando o jogo nunca foi salvo', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());
    expect(await saves.restoreSram()).toBeNull();
  });

  /**
   * SRAM é do cartucho, não do emulador: atualizar o core não pode apagar o
   * save que o jogo escreveu. Só o console precisa bater.
   */
  it('restaura SRAM gravada por outra versão de core', async () => {
    const storage = new MemorySaveStorage();
    const antigo = await adapterRodando({ coreVersion: 'fake-1.0.0' });
    const saves = gerenciador(antigo, storage);
    saves.watchSram();
    antigo.advanceFrames(120);
    await saves.flushSram();
    const sramJogada = await antigo.exportSram();

    const novo = await adapterRodando({ coreVersion: 'fake-2.0.0' });
    await gerenciador(novo, storage).restoreSram();

    expect(await novo.exportSram()).toEqual(sramJogada);
  });

  it('recusa SRAM de outro console', async () => {
    const storage = new MemorySaveStorage();
    const snes = await adapterRodando({ systemId: 'snes' });
    const saves = gerenciador(snes, storage);
    saves.watchSram();
    snes.advanceFrames(60);
    await saves.flushSram();

    const gameboy = await adapterRodando({ systemId: 'gb' });
    await expect(gerenciador(gameboy, storage).restoreSram()).rejects.toBeInstanceOf(
      SaveIncompatibleError,
    );
  });

  it('recusa mexer em SRAM quando o core não tem bateria', async () => {
    const adapter = await adapterRodando({ capabilities: { saveState: true } });
    const saves = gerenciador(adapter, new MemorySaveStorage());
    await expect(saves.restoreSram()).rejects.toBeInstanceOf(SaveCapabilityUnsupportedError);
  });
});

describe('SaveManager — save states', () => {
  /**
   * O outro critério de aceite da #22: salva no slot 2, reseta, carrega o
   * slot 2, volta ao ponto exato.
   */
  it('volta ao ponto exato depois de resetar', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());

    adapter.advanceFrames(300);
    const quadroSalvo = adapter.frameCount;
    const sramSalva = await adapter.exportSram();
    await saves.saveState(2);

    adapter.reset();
    expect(adapter.frameCount).toBe(0);
    expect(await adapter.exportSram()).not.toEqual(sramSalva);

    await saves.loadState(2);
    expect(adapter.frameCount).toBe(quadroSalvo);
    expect(await adapter.exportSram()).toEqual(sramSalva);
  });

  it('mantém os quatro slots independentes', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());

    const quadros: number[] = [];
    for (const slot of [0, 1, 2, 3] as const) {
      adapter.advanceFrames(100);
      quadros.push(adapter.frameCount);
      await saves.saveState(slot);
    }

    for (const slot of [3, 1, 0, 2] as const) {
      await saves.loadState(slot);
      expect(adapter.frameCount).toBe(quadros[slot]);
    }
  });

  it('recusa carregar slot vazio', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());
    const erro = await saves.loadState(1).catch((causa: unknown) => causa);

    expect(erro).toBeInstanceOf(SaveNotFoundError);
    expect(isSaveStorageError(erro) && erro.message).toContain('slot 1');
  });

  /**
   * O ponto da issue: carregar um state de outra versão de core não dá erro na
   * hora, dá partida corrompida depois. Recusar é a única saída honesta.
   */
  it('recusa state gravado por outra versão de core, sem tocar no emulador', async () => {
    const storage = new MemorySaveStorage();
    const antigo = await adapterRodando({ coreVersion: 'fake-1.0.0' });
    antigo.advanceFrames(300);
    await gerenciador(antigo, storage).saveState(2);

    const novo = await adapterRodando({ coreVersion: 'fake-2.0.0' });
    novo.advanceFrames(60);
    const quadroAntesDeTentar = novo.frameCount;
    const importar = vi.spyOn(novo, 'importState');

    const erro = await gerenciador(novo, storage)
      .loadState(2)
      .catch((causa: unknown) => causa);

    expect(erro).toBeInstanceOf(SaveIncompatibleError);
    expect(isSaveStorageError(erro) && erro.code).toBe('SAVE_INCOMPATIBLE');
    expect(isSaveStorageError(erro) && erro.message).toContain('fake-1.0.0');
    expect(isSaveStorageError(erro) && erro.message).toContain('fake-2.0.0');
    expect(importar).not.toHaveBeenCalled();
    expect(novo.frameCount).toBe(quadroAntesDeTentar);
  });

  it('recusa state gravado em outro console', async () => {
    const storage = new MemorySaveStorage();
    const snes = await adapterRodando({ systemId: 'snes' });
    snes.advanceFrames(60);
    await gerenciador(snes, storage).saveState(0);

    const gameboy = await adapterRodando({ systemId: 'gb' });
    const erro = await gerenciador(gameboy, storage)
      .loadState(0)
      .catch((causa: unknown) => causa);

    expect(erro).toBeInstanceOf(SaveIncompatibleError);
    expect(isSaveStorageError(erro) && erro.message).toContain('snes');
    expect(isSaveStorageError(erro) && erro.message).toContain('gb');
  });

  /**
   * Segunda linha de defesa: o core recusa o que os metadados não sabiam
   * (state de outra ROM). Precisa chegar na UI como o mesmo erro.
   */
  it('traduz a recusa do próprio core para SaveIncompatibleError', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    adapter.advanceFrames(60);
    await gerenciador(adapter, storage).saveState(0);

    const desconfiado = await adapterRodando({ failures: { importState: true } });
    await expect(gerenciador(desconfiado, storage).loadState(0)).rejects.toBeInstanceOf(
      SaveIncompatibleError,
    );
  });

  it('recusa save state quando o core não suporta', async () => {
    const adapter = await adapterRodando({ capabilities: { sram: true } });
    const saves = gerenciador(adapter, new MemorySaveStorage());
    await expect(saves.saveState(0)).rejects.toBeInstanceOf(SaveCapabilityUnsupportedError);
  });

  it('apaga um slot', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());
    adapter.advanceFrames(60);
    await saves.saveState(3);

    await saves.deleteState(3);
    await expect(saves.loadState(3)).rejects.toBeInstanceOf(SaveNotFoundError);
  });
});

describe('SaveManager — galeria de slots', () => {
  it('devolve sempre os quatro slots, cheios ou vazios', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());
    adapter.advanceFrames(120);
    await saves.saveState(1);

    const slots = await saves.listStates();
    expect(slots.map((slot) => slot.slot)).toEqual([0, 1, 2, 3]);
    expect(slots[0]?.metadata).toBeNull();
    expect(slots[1]?.metadata).toMatchObject({
      kind: 'state',
      slot: 1,
      systemId: 'snes',
      coreVersion: 'fake-1.0.0',
      updatedAt: 1_700_000_000_000,
    });
    expect(slots[1]?.metadata?.byteLength).toBeGreaterThan(0);
    expect(slots[1]?.incompatibleReason).toBeNull();
  });

  /**
   * Slot incompatível continua aparecendo na galeria: sumir com ele faria
   * parecer que o save se perdeu.
   */
  it('mostra o slot incompatível com o motivo, em vez de escondê-lo', async () => {
    const storage = new MemorySaveStorage();
    const antigo = await adapterRodando({ coreVersion: 'fake-1.0.0' });
    antigo.advanceFrames(60);
    await gerenciador(antigo, storage).saveState(0);

    const novo = await adapterRodando({ coreVersion: 'fake-2.0.0' });
    const slots = await gerenciador(novo, storage).listStates();

    expect(slots[0]?.metadata).not.toBeNull();
    expect(slots[0]?.incompatibleReason).toContain('fake-1.0.0');
  });

  it('não lista a SRAM entre os slots de save state', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();
    adapter.advanceFrames(60);
    await saves.flushSram();

    const slots = await saves.listStates();
    expect(slots.every((slot) => slot.metadata === null)).toBe(true);
  });
});

describe('SaveManager — miniatura (issue #23)', () => {
  /**
   * Critério de aceite da #23: três momentos, três miniaturas distintas.
   *
   * Em Node não há `OffscreenCanvas`, então o que é guardado é o quadro cru do
   * `FakeAdapter` — um SVG que carrega o número do quadro. Serve para provar
   * que a miniatura é do momento do save, que é o que a issue pede.
   */
  it('guarda uma miniatura distinta por momento do jogo', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());

    for (const slot of [0, 1, 2] as const) {
      adapter.advanceFrames(120);
      await saves.saveState(slot);
    }

    const slots = await saves.listStates();
    const imagens = await Promise.all(
      slots.slice(0, 3).map(async (slot) => slot.thumbnail?.text() ?? null),
    );

    expect(imagens.every((imagem) => imagem !== null)).toBe(true);
    expect(new Set(imagens).size).toBe(3);
  });

  it('anota no metadado que o state tem miniatura', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage());
    adapter.advanceFrames(60);

    const metadata = await saves.saveState(0);
    expect(metadata.hasThumbnail).toBe(true);
  });

  it('salva o state mesmo quando a captura do quadro falha', async () => {
    const adapter = await adapterRodando();
    vi.spyOn(adapter, 'captureFrame').mockRejectedValue(new Error('sem contexto WebGL'));
    const avisos = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const saves = gerenciador(adapter, new MemorySaveStorage());
    adapter.advanceFrames(60);

    const metadata = await saves.saveState(0);

    expect(metadata.hasThumbnail).toBe(false);
    expect(avisos).toHaveBeenCalled();
    await expect(saves.loadState(0)).resolves.toMatchObject({ slot: 0 });
    avisos.mockRestore();
  });

  it('a galeria usa o placeholder quando o state não tem miniatura', async () => {
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, new MemorySaveStorage(), { thumbnail: false });
    adapter.advanceFrames(60);
    await saves.saveState(2);

    const slots = await saves.listStates();
    expect(slots[2]?.metadata?.hasThumbnail).toBe(false);
    expect(slots[2]?.thumbnail).toBeNull();
    expect(thumbnailUrl(slots[2]?.thumbnail ?? null)).toBe(THUMBNAIL_PLACEHOLDER);
  });

  it('a SRAM não carrega miniatura — ela não é uma fotografia da tela', async () => {
    const storage = new MemorySaveStorage();
    const adapter = await adapterRodando();
    const saves = gerenciador(adapter, storage);
    saves.watchSram();
    adapter.advanceFrames(60);
    await saves.flushSram();

    const guardado = await storage.read({ kind: 'sram', romId: ROM_ID });
    expect(guardado?.metadata.hasThumbnail).toBe(false);
    expect(guardado?.thumbnail).toBeNull();
  });
});

describe('SaveManager — gravações rápidas de slots', () => {
  it('serializa duas gravações e distingue versões mesmo com o relógio parado', async () => {
    const adapter = await adapterRodando();
    const storage = new MemorySaveStorage();
    const saves = gerenciador(adapter, storage, { thumbnail: false });
    const [primeira, segunda] = await Promise.all([saves.saveState(0), saves.saveState(0)]);
    expect(segunda.updatedAt).toBe(primeira.updatedAt + 1);
    expect((await saves.listStates())[0]?.metadata?.updatedAt).toBe(segunda.updatedAt);
    await saves.dispose();
    await adapter.destroy();
  });
});
