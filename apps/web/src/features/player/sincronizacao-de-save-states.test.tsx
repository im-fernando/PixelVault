// @vitest-environment jsdom
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveStorage, stateKey, type SaveSlotView } from './storage/index.js';
import { gravarRevisaoDeSaveStateSincronizada } from './storage/state-sync-pointer.js';
import { useSincronizacaoDeSaveStates } from './sincronizacao-de-save-states.js';

const ROM_ID = 'b'.repeat(64);
const MINIATURA = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });

function vistaVazia(slot: 0 | 1 | 2 | 3): SaveSlotView {
  return { slot, metadata: null, thumbnail: null, incompatibleReason: null };
}

function vistaCheia(slot: 0 | 1 | 2 | 3, updatedAt: number): SaveSlotView {
  return {
    slot,
    metadata: {
      format: 1,
      kind: 'state',
      romId: ROM_ID,
      slot,
      systemId: 'snes',
      coreVersion: 'teste-1',
      byteLength: 4,
      updatedAt,
      hasThumbnail: true,
    },
    thumbnail: MINIATURA,
    incompatibleReason: null,
  };
}

async function storageComEstadoLocal(slot: 0 | 1 | 2 | 3): Promise<MemorySaveStorage> {
  const storage = new MemorySaveStorage();
  await storage.write({
    key: stateKey(ROM_ID, slot),
    data: new Uint8Array([9, 9, 9, 9]),
    systemId: 'snes',
    coreVersion: 'teste-1',
    updatedAt: Date.parse('2026-09-01T10:00:00Z'),
    thumbnail: MINIATURA,
  });
  return storage;
}

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function resumoDaNuvem(
  slot: 0 | 1 | 2 | 3,
  revision: number,
  updatedAt = '2026-09-05T12:00:00.000Z',
) {
  return {
    slot,
    revision,
    sizeBytes: 4,
    updatedAt,
    thumbnailBase64: btoa(String.fromCharCode(1, 2, 3)),
  };
}

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

const NADA_LOCAL = [vistaVazia(0), vistaVazia(1), vistaVazia(2), vistaVazia(3)] as const;

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useSincronizacaoDeSaveStates', () => {
  it('classifica cada slot independente: local sem nuvem, nuvem sem local, sincronizado e divergente', async () => {
    gravarRevisaoDeSaveStateSincronizada(ROM_ID, 2, 5); // slot 2 já reconciliado com a revisão 5

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaJson({
          slots: [resumoDaNuvem(1, 1), resumoDaNuvem(2, 5), resumoDaNuvem(3, 9)],
        }),
      ),
    );

    const slotsLocais: SaveSlotView[] = [
      vistaCheia(0, Date.now()), // só local — slot 0
      vistaVazia(1), // só nuvem — slot 1
      vistaCheia(2, Date.now()), // sincronizado — slot 2
      vistaCheia(3, Date.now()), // divergente — slot 3 (pointer nunca gravado)
    ];

    const storage = new MemorySaveStorage();
    const { result } = renderHook(
      () => useSincronizacaoDeSaveStates(ROM_ID, slotsLocais, 'snes', 'teste-1', vi.fn(), storage),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot.size).toBe(4));

    expect(result.current.estadoPorSlot.get(0)).toBe('apenas-local');
    expect(result.current.estadoPorSlot.get(1)).toBe('apenas-nuvem');
    expect(result.current.estadoPorSlot.get(2)).toBe('sincronizado');
    expect(result.current.estadoPorSlot.get(3)).toBe('divergente');
  });

  it('sem nada em nenhum lado, o slot não aparece no mapa', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaJson({ slots: [] })),
    );

    const { result } = renderHook(
      () =>
        useSincronizacaoDeSaveStates(
          ROM_ID,
          NADA_LOCAL,
          'snes',
          'teste-1',
          vi.fn(),
          new MemorySaveStorage(),
        ),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot).toBeDefined());
    expect(result.current.estadoPorSlot.size).toBe(0);
  });

  it('slot "apenas-local": clicar sincronizar envia para a nuvem e marca o ponteiro', async () => {
    let corpoEnviado: unknown = null;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          corpoEnviado = JSON.parse(init.body as string);
          return respostaJson({
            status: 'gravado',
            revision: 1,
            sizeBytes: 4,
            updatedAt: '2026-09-06T00:00:00.000Z',
          });
        }
        return respostaJson({ slots: [] });
      }),
    );

    const storage = await storageComEstadoLocal(0);
    const slotsLocais = [vistaCheia(0, Date.now()), ...NADA_LOCAL.slice(1)];

    const { result } = renderHook(
      () => useSincronizacaoDeSaveStates(ROM_ID, slotsLocais, 'snes', 'teste-1', vi.fn(), storage),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot.get(0)).toBe('apenas-local'));

    result.current.aoClicarSincronizar(0);

    await waitFor(() => expect(corpoEnviado).not.toBeNull());
    expect((corpoEnviado as { revision: number }).revision).toBe(0);
    expect((corpoEnviado as { dataBase64: string }).dataBase64).not.toHaveLength(0);
  });

  it('slot "apenas-nuvem": clicar sincronizar baixa e grava local, sem abrir conflito', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.includes('/1')) {
          return respostaJson({
            status: 'encontrado',
            revision: 3,
            sizeBytes: 4,
            updatedAt: '2026-09-06T00:00:00.000Z',
            url: 'https://storage.exemplo/state-1',
            expiresInSeconds: 60,
          });
        }
        if (url.includes('storage.exemplo')) {
          return new Response(new Uint8Array([7, 7, 7, 7]));
        }
        return respostaJson({ slots: [resumoDaNuvem(1, 3)] });
      }),
    );

    const storage = new MemorySaveStorage();
    const recarregar = vi.fn(async () => undefined);
    const slotsLocais = [vistaVazia(0), vistaVazia(1), vistaVazia(2), vistaVazia(3)];

    const { result } = renderHook(
      () =>
        useSincronizacaoDeSaveStates(ROM_ID, slotsLocais, 'snes', 'teste-1', recarregar, storage),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot.get(1)).toBe('apenas-nuvem'));

    result.current.aoClicarSincronizar(1);

    await waitFor(async () => {
      const guardado = await storage.read(stateKey(ROM_ID, 1));
      expect(guardado?.data).toEqual(new Uint8Array([7, 7, 7, 7]));
    });
    expect(recarregar).toHaveBeenCalled();
    expect(result.current.conflito).toBeNull();
  });

  it('slot divergente: clicar sincronizar abre o conflito da #107, não resolve por conta própria', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaJson({ slots: [resumoDaNuvem(3, 9)] })),
    );

    const storage = await storageComEstadoLocal(3);
    const slotsLocais = [vistaVazia(0), vistaVazia(1), vistaVazia(2), vistaCheia(3, Date.now())];

    const { result } = renderHook(
      () => useSincronizacaoDeSaveStates(ROM_ID, slotsLocais, 'snes', 'teste-1', vi.fn(), storage),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot.get(3)).toBe('divergente'));

    result.current.aoClicarSincronizar(3);

    await waitFor(() => expect(result.current.conflito).not.toBeNull());
    expect(result.current.conflito?.slot).toBe(3);
    expect(result.current.conflito?.nuvem.revision).toBe(9);
    // Nada foi sobrescrito sozinho: os bytes locais continuam os originais.
    const guardado = await storage.read(stateKey(ROM_ID, 3));
    expect(guardado?.data).toEqual(new Uint8Array([9, 9, 9, 9]));
  });

  it('resolver o conflito escolhendo "manter a nuvem" grava o ponteiro e relê o local', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaJson({ slots: [resumoDaNuvem(0, 7)] })),
    );

    const storage = await storageComEstadoLocal(0);
    const recarregar = vi.fn(async () => undefined);
    const slotsLocais = [vistaCheia(0, Date.now()), vistaVazia(1), vistaVazia(2), vistaVazia(3)];

    const { result } = renderHook(
      () =>
        useSincronizacaoDeSaveStates(ROM_ID, slotsLocais, 'snes', 'teste-1', recarregar, storage),
      { wrapper },
    );

    await waitFor(() => expect(result.current.estadoPorSlot.get(0)).toBe('divergente'));
    result.current.aoClicarSincronizar(0);
    await waitFor(() => expect(result.current.conflito).not.toBeNull());

    result.current.aoResolverConflito('nuvem');

    await waitFor(() => expect(result.current.conflito).toBeNull());
    expect(recarregar).toHaveBeenCalled();
  });
});
