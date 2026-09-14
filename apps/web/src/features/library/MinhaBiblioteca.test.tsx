// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MinhaBiblioteca } from './MinhaBiblioteca.js';

vi.mock('../auth/sessao.js', () => ({ useSessao: () => ({ estado: 'autenticado' }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('oferece pesquisa e salva a capa de PS1 sem gameId, atualizando a biblioteca', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const title = 'Resident Evil 2 - Dual Shock Ver. (USA) (Disc 1)';
  const coverUrl = 'https://example.com/resident-evil-2.png';
  let capa: string | null = null;
  const fetch = vi.fn(async (input: string, options?: RequestInit) => {
    const parsed = new URL(input, 'http://localhost');
    const url = parsed.pathname + parsed.search;
    let resposta: unknown;
    if (url === '/api/library/roms')
      resposta = [
        {
          id,
          title: title.replace('Ver.', 'Ver'),
          fileName: `${title}.chd`,
          systemId: 'ps1',
          gameId: null,
          coverUrl: capa,
          sha256: 'a'.repeat(64),
          sizeBytes: 600000000,
          isFavorite: false,
          uploadedAt: '2026-09-14T00:00:00.000Z',
        },
      ];
    else if (url.includes('/cover/search?')) resposta = { candidatas: [{ title, coverUrl }] };
    else if (url === `/api/library/roms/${id}/cover` && options?.method === 'POST') {
      expect(JSON.parse(String(options.body))).toEqual({ title });
      capa = coverUrl;
      resposta = { status: 'encontrada', coverUrl };
    } else throw new Error(`URL inesperada: ${url}`);
    return new Response(JSON.stringify(resposta), {
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', fetch);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const rootRoute = createRootRoute({ component: MinhaBiblioteca });
  const router = createRouter({
    routeTree: rootRoute,
    history: createMemoryHistory({ initialEntries: ['/'] }),
  });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole('button', { name: 'Identificar capa' }));
  expect((screen.getByRole('textbox', { name: 'Nome do jogo' }) as HTMLInputElement).value).toBe(
    title,
  );
  fireEvent.click(await screen.findByRole('button', { name: title }));
  await screen.findByText('Achamos! A capa já está na sua estante.');
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Identificar capa' })).toBeNull(),
  );
  expect(fetch.mock.calls.filter(([url]) => url.endsWith('/api/library/roms')).length).toBe(2);
});
