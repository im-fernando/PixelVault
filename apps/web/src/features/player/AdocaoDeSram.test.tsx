// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveStorage, sramKey } from './storage/index.js';
import { AdocaoDeSram } from './AdocaoDeSram.js';

const ROM_ID = 'a'.repeat(64);
const DADOS_LOCAIS = new Uint8Array([1, 2, 3, 4]);

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

async function storageComSramLocal(): Promise<MemorySaveStorage> {
  const storage = new MemorySaveStorage();
  await storage.write({
    key: sramKey(ROM_ID),
    data: DADOS_LOCAIS,
    systemId: 'snes',
    coreVersion: 'teste-1',
    updatedAt: Date.parse('2026-09-01T10:00:00Z'),
  });
  return storage;
}

function renderizar(storage: MemorySaveStorage) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <AdocaoDeSram romId={ROM_ID} storage={storage} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('AdocaoDeSram', () => {
  it('não mostra nada quando não há SRAM local', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => respostaJson({ status: 'sem-save' })),
    );

    const { container } = renderizar(new MemorySaveStorage());

    // Dá tempo do efeito de leitura local (assíncrono) resolver antes de
    // afirmar que continua vazio.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(container.innerHTML).toBe('');
  });

  it('oferece enviar quando há save local e a nuvem está vazia', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const corpo = JSON.parse(String(init.body)) as { revision: number };
          expect(corpo.revision).toBe(0);
          return respostaJson({
            status: 'gravado',
            revision: 1,
            sizeBytes: DADOS_LOCAIS.length,
            updatedAt: new Date().toISOString(),
          });
        }
        return respostaJson({ status: 'sem-save' });
      }),
    );

    const storage = await storageComSramLocal();
    renderizar(storage);

    const botao = await screen.findByRole('button', { name: /enviar para a nuvem/i });
    fireEvent.click(botao);

    await screen.findByText(/save enviado para a nuvem/i);

    // Cópia, nunca mudança de lugar: o save local continua no storage.
    const aindaLocal = await storage.read(sramKey(ROM_ID));
    expect(aindaLocal).not.toBeNull();
    expect(aindaLocal?.data).toEqual(DADOS_LOCAIS);
  });

  it('exige escolha explícita quando a nuvem já tem um save, sem enviar nada até confirmar', async () => {
    const postFn = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          postFn();
          return respostaJson({
            status: 'gravado',
            revision: 6,
            sizeBytes: DADOS_LOCAIS.length,
            updatedAt: new Date().toISOString(),
          });
        }
        return respostaJson({
          status: 'encontrado',
          revision: 5,
          sizeBytes: 999,
          updatedAt: '2026-08-01T12:00:00.000Z',
          dataBase64: 'ZmFrZQ==',
        });
      }),
    );

    const storage = await storageComSramLocal();
    renderizar(storage);

    // Os dois lados aparecem antes de qualquer escolha.
    await screen.findByText(/nuvem já tem um save/i);
    const confirmar = screen.getByRole('button', { name: /confirmar/i });

    // "Manter o da nuvem" vem pré-marcado — confirmar assim não manda nada.
    const radioNuvem = screen.getByRole('radio', { name: /manter o da nuvem/i });
    expect((radioNuvem as HTMLInputElement).checked).toBe(true);
    fireEvent.click(confirmar);
    await screen.findByText(/nada enviado/i);
    expect(postFn).not.toHaveBeenCalled();

    // Só depois de trocar a escolha explicitamente é que o envio acontece.
    fireEvent.click(screen.getByRole('radio', { name: /substituir/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirmar/i }));
    await waitFor(() => expect(postFn).toHaveBeenCalledTimes(1));

    const aindaLocal = await storage.read(sramKey(ROM_ID));
    expect(aindaLocal).not.toBeNull();
  });
});
