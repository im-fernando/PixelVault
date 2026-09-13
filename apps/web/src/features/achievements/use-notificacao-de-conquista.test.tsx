// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDeSessao } from '../auth/sessao.js';
import { gravarConquistasVistas } from './conquistas-vistas.js';
import { CHAVE_DAS_CONQUISTAS } from './use-conquistas.js';
import { useNotificacaoDeConquista } from './use-notificacao-de-conquista.js';

const USUARIO = {
  id: '33333333-3333-4333-8333-333333333333',
  email: 'dono@example.com',
  handle: 'dono',
  displayName: 'Dono da estante',
  publicProfile: true,
};

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function conquistaDesbloqueada(code: string, unlockedAt = '2026-09-01T10:00:00.000Z') {
  return { code, unlockedAt };
}

function montarQueryClient(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['sessao'], USUARIO);
  return queryClient;
}

function wrapperCom(queryClient: QueryClient) {
  return function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <ProvedorDeSessao>{children}</ProvedorDeSessao>
      </QueryClientProvider>
    );
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe('useNotificacaoDeConquista', () => {
  it('não notifica na primeira leitura deste navegador — só grava a base em silêncio', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
        if (url.includes('/achievements')) {
          return respostaJson({ achievements: [conquistaDesbloqueada('primeira_rom_enviada')] });
        }
        throw new Error(`fetch não esperado: ${url}`);
      }),
    );

    const queryClient = montarQueryClient();
    const { result } = renderHook(() => useNotificacaoDeConquista(), {
      wrapper: wrapperCom(queryClient),
    });

    await waitFor(() => expect(queryClient.getQueryData(CHAVE_DAS_CONQUISTAS)).not.toBeUndefined());
    expect(result.current).toBeNull();
  });

  it('notifica quando uma conquista nova aparece depois de uma leitura anterior', async () => {
    // Simula uma sessão anterior deste mesmo navegador: já viu a lista vazia.
    gravarConquistasVistas(USUARIO.id, new Set());

    const desbloqueadas = [conquistaDesbloqueada('primeira_rom_enviada')];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
        if (url.includes('/achievements')) return respostaJson({ achievements: desbloqueadas });
        throw new Error(`fetch não esperado: ${url}`);
      }),
    );

    const queryClient = montarQueryClient();
    const { result } = renderHook(() => useNotificacaoDeConquista(), {
      wrapper: wrapperCom(queryClient),
    });

    await waitFor(() => expect(result.current).toMatch(/primeiro cartucho/i));
  });

  it('não notifica de novo para uma conquista já vista', async () => {
    // A conta já tinha esta conquista, e este navegador já mostrou o aviso.
    gravarConquistasVistas(USUARIO.id, new Set(['primeira_rom_enviada']));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
        if (url.includes('/achievements')) {
          return respostaJson({ achievements: [conquistaDesbloqueada('primeira_rom_enviada')] });
        }
        throw new Error(`fetch não esperado: ${url}`);
      }),
    );

    const queryClient = montarQueryClient();
    const { result } = renderHook(() => useNotificacaoDeConquista(), {
      wrapper: wrapperCom(queryClient),
    });

    await waitFor(() => expect(queryClient.getQueryData(CHAVE_DAS_CONQUISTAS)).not.toBeUndefined());
    // Dá tempo de qualquer efeito assíncrono correr antes de afirmar que
    // continua em silêncio.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(result.current).toBeNull();
  });
});
