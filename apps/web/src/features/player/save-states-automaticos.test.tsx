// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { stateUploadRequestSchema, uuidSchema, type StateSlotResumo } from '@pixelvault/contracts';
import {
  MemorySaveStorage,
  SAVE_SLOTS,
  stateKey,
  type SaveSlot,
  type SaveSlotView,
} from './storage/index.js';
import { lerPointerDeSaveState, gravarPointerDeSaveState } from './storage/state-sync-pointer.js';
import { useSincronizacaoDeSaveStates } from './sincronizacao-de-save-states.js';

const HASH = 'c'.repeat(64);
const ID = '11111111-1111-4111-8111-111111111111';
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let remoto: StateSlotResumo[];
let offline: boolean;
let posts: { slot: number; revision: number; dataBase64: string }[];
let segurar: (() => Promise<void>) | null;

beforeEach(() => {
  localStorage.clear();
  remoto = [];
  offline = false;
  posts = [];
  segurar = null;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      if (!url.includes('/api/progress/state/')) return json([]);
      const [id, numero] = url.split('/api/progress/state/')[1]!.split('/');
      // A mesma exigência da rota real: um SHA-256 não é UUID.
      uuidSchema.parse(id);
      if (offline) throw new TypeError('offline');
      if (init?.method !== 'POST') return json({ slots: remoto });
      const entrada = stateUploadRequestSchema.parse(JSON.parse(init.body as string));
      const slot = Number(numero) as SaveSlot;
      posts.push({ slot, revision: entrada.revision, dataBase64: entrada.dataBase64 });
      await segurar?.();
      const anterior = remoto.find((s) => s.slot === slot);
      if ((anterior?.revision ?? 0) !== entrada.revision)
        return json(
          {
            code: 'CONFLICT',
            message: 'Revisão mudou',
            details: { revision: [String(anterior?.revision)] },
          },
          409,
        );
      const atual = {
        slot,
        revision: entrada.revision + 1,
        sizeBytes: 4,
        updatedAt: new Date().toISOString(),
        thumbnailBase64: entrada.thumbnailBase64,
      };
      remoto = [...remoto.filter((s) => s.slot !== slot), atual];
      return json({ status: 'gravado', ...atual });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

async function escrever(storage: MemorySaveStorage, slot: SaveSlot, versao: number) {
  await storage.write({
    key: stateKey(HASH, slot),
    data: new Uint8Array([versao, 2, 3, 4]),
    systemId: 'snes',
    coreVersion: 'teste-1',
    updatedAt: versao,
    thumbnail: null,
  });
}
async function vistas(storage: MemorySaveStorage): Promise<SaveSlotView[]> {
  return Promise.all(
    SAVE_SLOTS.map(async (slot) => ({
      slot,
      metadata: (await storage.read(stateKey(HASH, slot)))?.metadata ?? null,
      thumbnail: null,
      incompatibleReason: null,
    })),
  );
}
function montar(
  storage: MemorySaveStorage,
  slots: readonly SaveSlotView[],
  apiId: string | null = ID,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(
    ({ locais }) =>
      useSincronizacaoDeSaveStates(HASH, locais, 'snes', 'teste-1', async () => {}, storage, apiId),
    {
      initialProps: { locais: slots },
      wrapper: ({ children }) => (
        <QueryClientProvider client={client}>{children}</QueryClientProvider>
      ),
    },
  );
}

describe('backup automático dos slots', () => {
  it('envia os quatro slots sem clique extra, inclusive sem miniatura, usando UUID na API e hash no disco', async () => {
    const storage = new MemorySaveStorage();
    for (const slot of SAVE_SLOTS) await escrever(storage, slot, slot + 1);
    const { result } = montar(storage, await vistas(storage));
    await waitFor(() => expect(posts).toHaveLength(4));
    await waitFor(() =>
      expect([...result.current.estadoPorSlot.values()]).toEqual(Array(4).fill('sincronizado')),
    );
    expect(posts.map((p) => p.slot)).toEqual([0, 1, 2, 3]);
    for (const slot of SAVE_SLOTS) {
      expect(lerPointerDeSaveState(ID, slot)?.revision).toBe(1);
      expect(await storage.read(stateKey(HASH, slot))).not.toBeNull();
      expect(await storage.read(stateKey(ID, slot))).toBeNull();
    }
  });

  it('reenvia a versão nova salva enquanto o upload anterior ainda está em voo', async () => {
    const storage = new MemorySaveStorage();
    await escrever(storage, 0, 1);
    let liberar!: () => void;
    const espera = new Promise<void>((resolve) => {
      liberar = resolve;
    });
    segurar = () => espera;
    const { result, rerender } = montar(storage, await vistas(storage));
    await waitFor(() => expect(posts).toHaveLength(1));
    await escrever(storage, 0, 2);
    rerender({ locais: await vistas(storage) });
    expect(posts).toHaveLength(1);
    await act(async () => {
      segurar = null;
      liberar();
    });
    await waitFor(() => expect(posts).toHaveLength(2));
    await waitFor(() => expect(result.current.estadoPorSlot.get(0)).toBe('sincronizado'));
    expect(posts.map((p) => p.revision)).toEqual([0, 1]);
    expect(posts[1]?.dataBase64).toBe(btoa(String.fromCharCode(2, 2, 3, 4)));
    expect(lerPointerDeSaveState(ID, 0)?.updatedAtLocal).toBe(2);
  });

  it('preserva o save offline e retoma ao reconectar sem pedir outro clique', async () => {
    const storage = new MemorySaveStorage();
    const { result, rerender } = montar(storage, await vistas(storage));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    offline = true;
    await escrever(storage, 2, 7);
    rerender({ locais: await vistas(storage) });
    await waitFor(() => expect(result.current.erro).toContain('preservado'));
    expect(posts).toHaveLength(0);
    offline = false;
    act(() => window.dispatchEvent(new Event('online')));
    await waitFor(() => expect(result.current.estadoPorSlot.get(2)).toBe('sincronizado'));
    expect(posts).toHaveLength(1);
  });

  it('retoma um save pendente ao reabrir o jogo', async () => {
    const storage = new MemorySaveStorage();
    await escrever(storage, 1, 8);
    offline = true;
    const primeira = montar(storage, await vistas(storage));
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalled());
    primeira.unmount();
    offline = false;
    const segunda = montar(storage, await vistas(storage));
    await waitFor(() => expect(segunda.result.current.estadoPorSlot.get(1)).toBe('sincronizado'));
    expect(posts).toHaveLength(1);
  });

  it('não sobrescreve uma revisão alterada por outro aparelho', async () => {
    const storage = new MemorySaveStorage();
    await escrever(storage, 0, 2);
    gravarPointerDeSaveState(ID, 0, 1, 1);
    remoto = [
      {
        slot: 0,
        revision: 2,
        sizeBytes: 4,
        updatedAt: new Date().toISOString(),
        thumbnailBase64: 'AQID',
      },
    ];
    const { result } = montar(storage, await vistas(storage));
    await waitFor(() => expect(result.current.estadoPorSlot.get(0)).toBe('divergente'));
    expect(posts).toHaveLength(0);
    expect((await storage.read(stateKey(HASH, 0)))?.data[0]).toBe(2);
  });

  it('não consulta nem envia à nuvem quando o player está sem biblioteca autenticada', async () => {
    const storage = new MemorySaveStorage();
    await escrever(storage, 0, 1);
    montar(storage, await vistas(storage), null);
    await act(async () => {});
    expect(fetch).not.toHaveBeenCalled();
  });
});
