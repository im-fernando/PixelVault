// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { IdentificarCapa } from './IdentificarCapa.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('esconde sugestões antigas imediatamente e permite recuperar falha de rede', async () => {
  let falhar = true;
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      requests.push(input);
      if (input.includes('Zelda') && falhar) throw new Error('offline');
      return new Response(
        JSON.stringify({
          candidatas: [
            {
              title: input.includes('Zelda') ? 'Zelda' : 'Mario',
              coverUrl: 'https://example.com/cover.png',
            },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <IdentificarCapa
        gameId="11111111-1111-4111-8111-111111111111"
        tituloSugerido="Mario"
        fechar={() => undefined}
      />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: 'Mario' });
  fireEvent.change(screen.getByRole('textbox', { name: 'Nome do jogo' }), {
    target: { value: 'Zelda' },
  });
  expect(screen.queryByRole('button', { name: 'Mario' })).toBeNull();
  await screen.findByRole('alert');
  expect(screen.queryByText(/Nenhuma sugestão/)).toBeNull();
  falhar = false;
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByRole('button', { name: 'Zelda' });
  await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  expect(requests.filter((url) => url.includes('Zelda'))).toHaveLength(2);
});
