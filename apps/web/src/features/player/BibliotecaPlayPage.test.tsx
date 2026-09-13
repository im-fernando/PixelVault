// @vitest-environment jsdom
import { StrictMode, type ReactNode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { EmulatorRegistry } from '@pixelvault/emulator-runtime';
import { FakeAdapter } from '@pixelvault/emulator-runtime/testing';
import { ProvedorDeSessao } from '../auth/sessao.js';
import { BibliotecaPlayPage } from './BibliotecaPlayPage.js';

/**
 * `FichaDeAcervo` e a tela de "não encontrada" usam `<Link>` do TanStack
 * Router ("← acervo", "Voltar para a biblioteca") — sem um router de
 * verdade por perto, `useLinkProps` explode. Um root route cujo componente
 * É a árvore que o teste quer montar basta: não precisamos de rota nenhuma
 * de destino, só do contexto que faz `<Link to="/">` resolver.
 */
function renderizarComRouter(elemento: ReactNode) {
  const rootRoute = createRootRoute({ component: () => elemento });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  return render(<RouterProvider router={router} />);
}

const ROM_ID = '11111111-1111-4111-8111-111111111111';
const SHA256 = 'a'.repeat(64);

const USUARIO = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'dono@example.com',
  handle: 'dono',
  displayName: 'Dono da ROM',
  publicProfile: true,
};

/**
 * `useBiblioteca` só dispara com sessão autenticada. Em vez de mockar
 * `GET /api/auth/me`, semeia direto a mesma chave que `ProvedorDeSessao` lê
 * (`opcoesDaConsultaDeSessao`, `queryKey: ['sessao']`) — o mesmo truque que
 * `save-sobrevive-a-conta.test.ts` usa depois de um `useCadastrar` de
 * verdade, só que sem precisar da mutação inteira aqui.
 */
function clienteDeConsultaAutenticado(): QueryClient {
  const queryClient = clienteDeConsulta();
  queryClient.setQueryData(['sessao'], USUARIO);
  return queryClient;
}

function itemDaBiblioteca(): unknown {
  return {
    id: ROM_ID,
    title: 'Sure Instinct',
    systemId: 'snes',
    gameId: null,
    coverUrl: null,
    fileName: 'sure-instinct.sfc',
    sizeBytes: 512 * 1024,
    sha256: SHA256,
    isFavorite: false,
    uploadedAt: new Date().toISOString(),
  };
}

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function clienteDeConsulta(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  // Mesmo raciocínio do teste de `EmulatorPlayer`: o relógio manual do
  // adapter falso andaria fora do `act` e encheria a saída de aviso.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('BibliotecaPlayPage', () => {
  it('carrega e joga a ROM de quem é dona dela', async () => {
    const registry = new EmulatorRegistry();
    registry.register('snes', () => new FakeAdapter());

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
        if (url.includes('/library/roms/') && url.endsWith('/download')) {
          return respostaJson({
            url: 'http://storage.local/roms/sure-instinct.sfc',
            expiresInSeconds: 60,
            sha256: SHA256,
            sizeBytes: 512 * 1024,
            fileName: 'sure-instinct.sfc',
          });
        }
        if (url.includes('/library/roms')) {
          return respostaJson([itemDaBiblioteca()]);
        }
        // `AdocaoDeSram` (#92) consulta isto ao montar. Sem save local
        // nenhum (jsdom sem OPFS/IndexedDB cai no storage em memória, vazio),
        // o componente não mostra nada — a resposta aqui só existe para o
        // fetch não sobrar como "não esperado".
        if (url.includes('/progress/sram/')) {
          return respostaJson({ status: 'sem-save' });
        }
        throw new Error(`fetch não esperado: ${url}`);
      }),
    );

    renderizarComRouter(
      <StrictMode>
        <QueryClientProvider client={clienteDeConsultaAutenticado()}>
          <ProvedorDeSessao>
            <BibliotecaPlayPage romId={ROM_ID} registry={registry} />
          </ProvedorDeSessao>
        </QueryClientProvider>
      </StrictMode>,
    );

    await screen.findByText(/rodando|pronto|carregando/i);
  });

  /**
   * O servidor já garante que os dois casos respondem o mesmo 404 byte a
   * byte (`autorizar-download-de-rom.ts`, coberto no `apps/api`). Este teste
   * cobre o lado do front: que ele não tenta separar os dois casos na tela —
   * romId de outra conta (biblioteca própria vazia, download recusado) e
   * romId inexistente (mesma coisa) caem na mesma mensagem genérica.
   */
  it.each([{ nome: 'romId de outra conta' }, { nome: 'romId inexistente' }])(
    'mostra a mesma recusa para $nome',
    async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: RequestInfo | URL) => {
          const url = String(input);
          if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
          if (url.includes('/download')) {
            return respostaJson({ code: 'NOT_FOUND', message: 'ROM não encontrada' }, 404);
          }
          if (url.includes('/library/roms')) {
            return respostaJson([]);
          }
          throw new Error(`fetch não esperado: ${url}`);
        }),
      );

      renderizarComRouter(
        <QueryClientProvider client={clienteDeConsultaAutenticado()}>
          <ProvedorDeSessao>
            <BibliotecaPlayPage romId={ROM_ID} />
          </ProvedorDeSessao>
        </QueryClientProvider>,
      );

      await screen.findByText('ROM não encontrada');
    },
  );
});
