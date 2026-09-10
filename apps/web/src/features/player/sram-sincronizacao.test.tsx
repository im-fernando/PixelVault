// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemorySaveStorage, sramKey } from './storage/index.js';
import { gravarRevisaoSincronizada, lerRevisaoSincronizada } from './storage/sram-sync-revision.js';
import { useSincronizacaoDeSram } from './sram-sincronizacao.js';

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

function wrapper({ children }: { readonly children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useSincronizacaoDeSram', () => {
  it('puxa a SRAM da nuvem para o storage local quando este aparelho já está vinculado e a nuvem avançou', async () => {
    gravarRevisaoSincronizada(ROM_ID, 3);
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaJson({
          status: 'encontrado',
          revision: 4,
          sizeBytes: 4,
          updatedAt: '2026-09-05T12:00:00.000Z',
          dataBase64: btoa(String.fromCharCode(9, 9, 9, 9)),
        }),
      ),
    );

    const storage = await storageComSramLocal();
    const { result } = renderHook(() => useSincronizacaoDeSram(ROM_ID, 'snes', storage), {
      wrapper,
    });

    await waitFor(() => expect(result.current.pronto).toBe(true));
    expect(result.current.vinculado).toBe(true);
    expect(result.current.estado).toBe('sincronizado');

    const guardado = await storage.read(sramKey(ROM_ID));
    expect(guardado?.data).toEqual(new Uint8Array([9, 9, 9, 9]));
    expect(lerRevisaoSincronizada(ROM_ID)).toBe(4);
  });

  it('não mexe no local quando este aparelho nunca sincronizou este romId — deixa a colisão para a #92', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        respostaJson({
          status: 'encontrado',
          revision: 4,
          sizeBytes: 999,
          updatedAt: '2026-09-05T12:00:00.000Z',
          dataBase64: 'ZmFrZQ==',
        }),
      ),
    );

    const storage = await storageComSramLocal();
    const { result } = renderHook(() => useSincronizacaoDeSram(ROM_ID, 'snes', storage), {
      wrapper,
    });

    await waitFor(() => expect(result.current.pronto).toBe(true));
    expect(result.current.vinculado).toBe(false);
    expect(result.current.estado).toBeNull();

    // O save local continua exatamente o que era — ninguém sobrescreveu por
    // conta própria (ADR 0020, regra 4).
    const guardado = await storage.read(sramKey(ROM_ID));
    expect(guardado?.data).toEqual(DADOS_LOCAIS);
  });

  it('envia em segundo plano quando a SRAM local é regravada, sem travar a chamada', async () => {
    gravarRevisaoSincronizada(ROM_ID, 1);
    const chamadasPost: number[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          const corpo = JSON.parse(String(init.body)) as { revision: number };
          chamadasPost.push(corpo.revision);
          return respostaJson({
            status: 'gravado',
            revision: corpo.revision + 1,
            sizeBytes: DADOS_LOCAIS.length,
            updatedAt: new Date().toISOString(),
          });
        }
        return respostaJson({
          status: 'encontrado',
          revision: 1,
          sizeBytes: DADOS_LOCAIS.length,
          updatedAt: '2026-09-01T10:00:00.000Z',
          dataBase64: 'AQIDBA==',
        });
      }),
    );

    const storage = await storageComSramLocal();
    const { result } = renderHook(() => useSincronizacaoDeSram(ROM_ID, 'snes', storage), {
      wrapper,
    });
    await waitFor(() => expect(result.current.vinculado).toBe(true));

    // A chamada em si nunca espera rede — é `void`, e o teste confirma que
    // ela devolve imediatamente (não é uma promise que o teste precisa aguardar).
    const antes = performance.now();
    act(() => {
      result.current.registrarGravacaoLocal({
        format: 1,
        kind: 'sram',
        romId: ROM_ID,
        systemId: 'snes',
        coreVersion: 'teste-1',
        byteLength: DADOS_LOCAIS.length,
        updatedAt: Date.now(),
        hasThumbnail: false,
      });
    });
    expect(performance.now() - antes).toBeLessThan(50);

    await waitFor(() => expect(chamadasPost).toHaveLength(1), { timeout: 6000 });
    expect(chamadasPost[0]).toBe(1);
  }, 10000);

  it('em 409, não insiste na escrita rejeitada — deixa a nuvem vencer e reconcilia', async () => {
    gravarRevisaoSincronizada(ROM_ID, 1);
    let primeiroPost = true;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') {
          if (primeiroPost) {
            primeiroPost = false;
            return respostaJson(
              {
                code: 'CONFLICT',
                message: 'revisão desatualizada',
                details: { revision: ['2'] },
              },
              409,
            );
          }
          throw new Error('não deveria tentar reenviar a escrita rejeitada');
        }
        return respostaJson({
          status: 'encontrado',
          revision: 2,
          sizeBytes: 4,
          updatedAt: '2026-09-06T00:00:00.000Z',
          dataBase64: btoa(String.fromCharCode(5, 5, 5, 5)),
        });
      }),
    );

    const storage = await storageComSramLocal();
    const { result } = renderHook(() => useSincronizacaoDeSram(ROM_ID, 'snes', storage), {
      wrapper,
    });
    await waitFor(() => expect(result.current.vinculado).toBe(true));

    act(() => {
      result.current.registrarGravacaoLocal({
        format: 1,
        kind: 'sram',
        romId: ROM_ID,
        systemId: 'snes',
        coreVersion: 'teste-1',
        byteLength: DADOS_LOCAIS.length,
        updatedAt: Date.now(),
        hasThumbnail: false,
      });
    });

    // A nuvem (revisão 2) vence e acaba sincronizada no local, sem re-tentar
    // a escrita que perdeu.
    await waitFor(
      async () => {
        expect(lerRevisaoSincronizada(ROM_ID)).toBe(2);
        const guardado = await storage.read(sramKey(ROM_ID));
        expect(guardado?.data).toEqual(new Uint8Array([5, 5, 5, 5]));
      },
      { timeout: 6000 },
    );
  }, 10000);
});
