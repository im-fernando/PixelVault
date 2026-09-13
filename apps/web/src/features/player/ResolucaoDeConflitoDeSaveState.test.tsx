// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveStorage, stateKey } from './storage/index.js';
import {
  ResolucaoDeConflitoDeSaveState,
  type LadoLocalDoConflito,
  type LadoNuvemDoConflito,
} from './ResolucaoDeConflitoDeSaveState.js';

const ROM_ID = 'a'.repeat(64);
const SLOT = 0;
const DADOS_LOCAIS = new Uint8Array([1, 2, 3, 4]);

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function ladoLocal(overrides: Partial<LadoLocalDoConflito> = {}): LadoLocalDoConflito {
  return {
    metadata: {
      format: 1,
      kind: 'state',
      romId: ROM_ID,
      slot: SLOT,
      systemId: 'snes',
      coreVersion: 'teste-1',
      byteLength: DADOS_LOCAIS.length,
      updatedAt: Date.parse('2026-09-01T10:00:00Z'),
      hasThumbnail: true,
    },
    thumbnail: new Blob([new Uint8Array([1, 1, 1])], { type: 'image/webp' }),
    data: DADOS_LOCAIS,
    ...overrides,
  };
}

const LADO_NUVEM: LadoNuvemDoConflito = {
  revision: 5,
  sizeBytes: 999,
  updatedAt: '2026-08-01T12:00:00.000Z',
  thumbnailBase64: btoa('miniatura-da-nuvem'),
};

function renderizar(props: {
  local: LadoLocalDoConflito;
  nuvem: LadoNuvemDoConflito;
  storage: MemorySaveStorage;
  aoResolver?: (escolha: 'nuvem' | 'local') => void;
}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ResolucaoDeConflitoDeSaveState
        romId={ROM_ID}
        slot={SLOT}
        local={props.local}
        nuvem={props.nuvem}
        storage={props.storage}
        aoResolver={props.aoResolver}
      />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('ResolucaoDeConflitoDeSaveState', () => {
  it('mostra os dois lados com data sempre e miniatura quando existe', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderizar({
      local: ladoLocal(),
      nuvem: LADO_NUVEM,
      storage: new MemorySaveStorage(),
    });

    // As duas miniaturas (local e nuvem) renderizam como imagem, não
    // placeholder — `alt=""` é decorativo de propósito (mesma convenção de
    // `GaleriaDeSlots`), então a busca é por tag, não por role acessível.
    expect(container.querySelectorAll('img')).toHaveLength(2);
    expect(screen.getByText(/^este aparelho$/i)).toBeTruthy();
    expect(screen.getByText(/^nuvem$/i)).toBeTruthy();
  });

  it('sem miniatura local, permite preservar os bytes na nuvem', () => {
    vi.stubGlobal('fetch', vi.fn());
    const { container } = renderizar({
      local: ladoLocal({ thumbnail: null }),
      nuvem: LADO_NUVEM,
      storage: new MemorySaveStorage(),
    });

    const radioLocal = screen.getByRole('radio', { name: /substituir/i });
    expect((radioLocal as HTMLInputElement).disabled).toBe(false);
    // Só uma miniatura agora: a nuvem tem, o local não.
    expect(container.querySelectorAll('img')).toHaveLength(1);
    expect(screen.queryByText(/não é possível enviar/i)).toBeNull();
  });

  it('"manter a nuvem" baixa os bytes e grava local, sem enviar nada para a nuvem', async () => {
    const postFn = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === 'POST') {
          postFn();
          return respostaJson({
            status: 'gravado',
            revision: 6,
            sizeBytes: DADOS_LOCAIS.length,
            updatedAt: new Date().toISOString(),
          });
        }
        if (url.includes('/api/progress/state/')) {
          return respostaJson({
            status: 'encontrado',
            revision: 5,
            sizeBytes: 4,
            updatedAt: LADO_NUVEM.updatedAt,
            url: 'https://storage.test/save-state-assinado',
            expiresInSeconds: 60,
          });
        }
        // O fetch direto à URL assinada — bytes crus, sem JSON.
        return new Response(new Uint8Array([9, 9, 9, 9]).buffer, { status: 200 });
      }),
    );

    const storage = new MemorySaveStorage();
    const aoResolver = vi.fn();
    renderizar({ local: ladoLocal(), nuvem: LADO_NUVEM, storage, aoResolver });

    // "Manter o da nuvem" vem pré-marcado.
    const radioNuvem = screen.getByRole('radio', { name: /manter o da nuvem/i });
    expect((radioNuvem as HTMLInputElement).checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(aoResolver).toHaveBeenCalledWith('nuvem'));
    expect(postFn).not.toHaveBeenCalled();

    const gravado = await storage.read(stateKey(ROM_ID, SLOT));
    expect(gravado).not.toBeNull();
    expect(gravado?.data).toEqual(new Uint8Array([9, 9, 9, 9]));
    // A identidade local (systemId/coreVersion) é preservada, não a da nuvem
    // (que não existe) — é o que evita o save carregado depois vir marcado
    // como incompatível.
    expect(gravado?.metadata.systemId).toBe('snes');
    expect(gravado?.metadata.coreVersion).toBe('teste-1');
  });

  it('"substituir pela local" envia os bytes locais com a revisão da nuvem', async () => {
    const postFn = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const corpo = JSON.parse(String(init.body)) as { revision: number };
          postFn(corpo);
          return respostaJson({
            status: 'gravado',
            revision: 6,
            sizeBytes: DADOS_LOCAIS.length,
            updatedAt: new Date().toISOString(),
          });
        }
        return respostaJson({ status: 'sem-save' });
      }),
    );

    const storage = new MemorySaveStorage();
    const aoResolver = vi.fn();
    renderizar({ local: ladoLocal(), nuvem: LADO_NUVEM, storage, aoResolver });

    fireEvent.click(screen.getByRole('radio', { name: /substituir/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));

    await waitFor(() => expect(aoResolver).toHaveBeenCalledWith('local'));
    expect(postFn).toHaveBeenCalledTimes(1);
    expect(postFn.mock.calls[0]?.[0]).toMatchObject({ revision: LADO_NUVEM.revision });
  });

  it('sem confirmar, nenhuma escolha é aplicada', () => {
    const fetchFn = vi.fn();
    vi.stubGlobal('fetch', fetchFn);
    renderizar({ local: ladoLocal(), nuvem: LADO_NUVEM, storage: new MemorySaveStorage() });

    expect(fetchFn).not.toHaveBeenCalled();
  });
});
