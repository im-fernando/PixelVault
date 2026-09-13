// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useEnvioDeRom } from './use-envio-de-rom.js';

/**
 * A fila de um lote (#137-ish: "vários jogos, ou uma pasta"), sem precisar
 * exercitar o PUT de verdade — todo arquivo aqui bate no atalho do hash
 * (`ja-na-biblioteca`), que `enviarRom` resolve antes de tocar em qualquer
 * envio. É o mesmo atalho que `envio-de-rom.test.ts` já teste, aqui só
 * multiplicado: o que está sob teste é a FILA, não o protocolo de upload de
 * um arquivo, que já tem suíte própria.
 */
function arquivoDeRom(nome: string): File {
  return new File([new Uint8Array(1024)], nome);
}

let proximoRomId = 0;

/** Cada requisição responde `ja-na-biblioteca` com um `romId` novo (UUID de verdade — o contrato exige). */
function fetchQueSempreJaTem() {
  return vi.fn(() => {
    proximoRomId += 1;
    const romId = `11111111-1111-4111-8111-${String(proximoRomId).padStart(12, '0')}`;
    return Promise.resolve(
      new Response(JSON.stringify({ status: 'ja-na-biblioteca', romId }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );
  });
}

function envolvido(queryClient: QueryClient) {
  return ({ children }: { readonly children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useEnvioDeRom — fila de mais de um arquivo', () => {
  it('processa em sequência e cada um entra em nestaSessao', async () => {
    const fetchMock = fetchQueSempreJaTem();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useEnvioDeRom(), { wrapper: envolvido(queryClient) });

    result.current.enviar([arquivoDeRom('mario.sfc'), arquivoDeRom('zelda.sfc')]);

    await waitFor(() => expect(result.current.nestaSessao).toHaveLength(2));
    expect(result.current.restantesNaFila).toBe(0);
    expect(result.current.falhas).toHaveLength(0);
    // Um `fetch` por arquivo — a fila não paralelizou nem pulou nenhum.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('soltar mais arquivos enquanto o lote roda entra na mesma fila', async () => {
    vi.stubGlobal('fetch', fetchQueSempreJaTem() as unknown as typeof fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useEnvioDeRom(), { wrapper: envolvido(queryClient) });

    result.current.enviar([arquivoDeRom('a.sfc'), arquivoDeRom('b.sfc')]);
    result.current.enviar([arquivoDeRom('c.sfc')]);

    await waitFor(() => expect(result.current.nestaSessao).toHaveLength(3));
  });

  it('ignora, sem tentar rede, o que não tem cara de ROM dentro de um lote', async () => {
    const fetchMock = fetchQueSempreJaTem();
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { result } = renderHook(() => useEnvioDeRom(), { wrapper: envolvido(queryClient) });

    result.current.enviar([
      arquivoDeRom('jogo.sfc'),
      arquivoDeRom('leia-me.txt'),
      arquivoDeRom('capa.png'),
    ]);

    await waitFor(() => expect(result.current.nestaSessao).toHaveLength(1));
    // Os dois que não são ROM nunca chegaram a pedir upload nem apareceram
    // como falha — foram filtrados aqui mesmo, antes de qualquer rede.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.current.falhas).toHaveLength(0);
  });
});
