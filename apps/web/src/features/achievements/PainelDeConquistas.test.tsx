// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDeSessao } from '../auth/sessao.js';
import { PainelDeConquistas } from './PainelDeConquistas.js';

const USUARIO = {
  id: '44444444-4444-4444-8444-444444444444',
  email: 'dono@example.com',
  handle: 'dono',
  displayName: 'Dono da estante',
};

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

function montar(achievements: readonly { code: string; unlockedAt: string }[]) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
      if (url.includes('/achievements')) return respostaJson({ achievements });
      throw new Error(`fetch não esperado: ${url}`);
    }),
  );

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['sessao'], USUARIO);

  return render(
    <QueryClientProvider client={queryClient}>
      <ProvedorDeSessao>
        <PainelDeConquistas />
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PainelDeConquistas', () => {
  it('mostra a desbloqueada em destaque, com data, e as outras onze como bloqueadas', async () => {
    montar([{ code: 'primeira_rom_enviada', unlockedAt: '2026-09-01T10:00:00.000Z' }]);

    await screen.findByRole('heading', { name: /desbloqueadas \(1\)/i });
    await screen.findByText('Primeiro cartucho');

    await screen.findByRole('heading', { name: /a desbloquear \(11\)/i });
    expect(screen.getByText('Colecionista — bronze')).not.toBeNull();
    expect(screen.getByText('Dedicação — ouro')).not.toBeNull();
  });

  it('não destaca nenhuma conquista quando a conta ainda não desbloqueou nada', async () => {
    montar([]);

    await screen.findByRole('heading', { name: /desbloqueadas \(0\)/i });
    await screen.findByText(/nenhuma conquista desbloqueada ainda/i);
    await screen.findByRole('heading', { name: /a desbloquear \(12\)/i });
  });
});
