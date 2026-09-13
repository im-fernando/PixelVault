// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ProvedorDeSessao } from './sessao.js';
import { ConfiguracoesPage } from './ConfiguracoesPage.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('avisa quando falha ao desligar o perfil e permite tentar novamente', async () => {
  let falhar = true;
  const usuario = {
    id: '22222222-2222-4222-8222-222222222222',
    email: 'dono@example.com',
    handle: 'dono',
    displayName: 'Dono',
    publicProfile: true,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      if (input.includes('/public-profile')) {
        if (falhar) throw new Error('offline');
        return new Response(JSON.stringify({ user: { ...usuario, publicProfile: false } }));
      }
      return new Response(JSON.stringify({ user: usuario }));
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(['sessao'], usuario);
  const router = createRouter({
    routeTree: createRootRoute({ component: ConfiguracoesPage }),
    history: createMemoryHistory(),
  });
  render(
    <QueryClientProvider client={client}>
      <ProvedorDeSessao>
        <RouterProvider router={router} />
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
  const botao = await screen.findByRole('button', { name: 'Desligar', pressed: true });
  fireEvent.click(botao);
  expect((await screen.findByRole('alert')).textContent).toContain('Não foi possível confirmar');
  expect(screen.getByRole('button', { name: 'Desligar', pressed: true })).toBeTruthy();
  falhar = false;
  fireEvent.click(botao);
  await screen.findByRole('button', { name: 'Ligar', pressed: false });
  expect(screen.queryByRole('alert')).toBeNull();
});
