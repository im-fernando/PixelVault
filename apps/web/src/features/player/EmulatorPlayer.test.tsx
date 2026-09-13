// @vitest-environment jsdom
import { StrictMode, type ReactElement } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmulatorRegistry, romFromUrl } from '@pixelvault/emulator-runtime';
import { FakeAdapter } from '@pixelvault/emulator-runtime/testing';
import { MemorySaveStorage, stateKey } from './storage/index.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';

const ROM = romFromUrl('/roms/sure-instinct/sure-instinct.sfc', {
  fileName: 'sure-instinct.sfc',
});

/**
 * `EmulatorPlayer` passou a chamar `useSaveStatesNaNuvem` (React Query)
 * incondicionalmente desde a #108 — mesmo desligado (`sincronizarSaveStateNaNuvem`
 * ausente, `enabled: false` na consulta), o hook exige um `QueryClientProvider`
 * no galho, senão lança na hora do render. Nenhum destes testes passa
 * `romId`/liga a sincronização; existe só para o hook não explodir.
 */
function comQueryClient(elemento: ReactElement): ReactElement {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{elemento}</QueryClientProvider>;
}

function bancada(capabilities?: { saveState: boolean; sram: boolean }) {
  const registry = new EmulatorRegistry();
  const criados: FakeAdapter[] = [];

  registry.register('snes', () => {
    const adapter = new FakeAdapter(capabilities ? { capabilities } : {});
    criados.push(adapter);
    return adapter;
  });

  return { registry, criados };
}

async function assentar(): Promise<void> {
  // Duas voltas: a primeira resolve o `create`/`mount`/`loadGame`, a segunda
  // deixa o React aplicar o estado que veio deles.
  await screen.findByText(/rodando|pronto|carregando/i);
  await Promise.resolve();
}

beforeEach(() => {
  // O relógio manual do adapter falso andaria a 60 Hz durante o teste,
  // atualizando estado fora do `act` e enchendo a saída de aviso.
  vi.stubGlobal('requestAnimationFrame', () => 0);
  vi.stubGlobal('cancelAnimationFrame', () => undefined);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('EmulatorPlayer', () => {
  it('sobe até rodando com o adapter que veio do registry', async () => {
    const { registry, criados } = bancada();
    render(
      comQueryClient(
        <StrictMode>
          <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />
        </StrictMode>,
      ),
    );

    expect(await screen.findByText('rodando')).toBeTruthy();
    expect(criados.filter((adapter) => adapter.status === 'running')).toHaveLength(1);
  });

  it('vinte idas e voltas não deixam adapter vivo — nenhum contexto pendurado', async () => {
    const { registry, criados } = bancada();

    for (let i = 0; i < 20; i += 1) {
      const tela = render(
        comQueryClient(
          <StrictMode>
            <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />
          </StrictMode>,
        ),
      );
      await assentar();
      tela.unmount();
      // O descarte espera o boot terminar; sem esta volta, o teste mediria o
      // estado antes de o `destroy()` acontecer.
      await new Promise((resolver) => setTimeout(resolver, 0));
    }

    expect(criados.length).toBeGreaterThanOrEqual(20);
    expect(criados.filter((adapter) => adapter.status !== 'destroyed')).toHaveLength(0);
  });

  it('mostra salvar e carregar estado quando o core suporta', async () => {
    const { registry } = bancada({ saveState: true, sram: true });
    render(
      comQueryClient(
        <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />,
      ),
    );
    await assentar();

    expect(screen.queryByRole('button', { name: /Salvar estado/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Carregar estado/ })).not.toBeNull();
  });

  it('esconde salvar estado quando o core não suporta, em vez de deixar botão quebrado', async () => {
    const { registry } = bancada({ saveState: false, sram: true });
    render(
      comQueryClient(
        <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />,
      ),
    );
    await assentar();

    expect(screen.queryByRole('button', { name: /Salvar estado/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Carregar estado/ })).toBeNull();
  });

  it('a legenda do teclado mostra o mapa padrão de SNES', async () => {
    const { registry } = bancada();
    render(
      comQueryClient(
        <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />,
      ),
    );
    await assentar();

    const legenda = screen.getByLabelText('Mapeamento do teclado');
    expect(legenda.textContent).toContain('Start');
    expect(legenda.textContent).toContain('Enter');
    expect(legenda.textContent).toContain('Select');
  });

  it('a tela de erro traz o código do runtime e a ação de tentar de novo', async () => {
    const registry = new EmulatorRegistry();
    registry.register('snes', () => new FakeAdapter({ failures: { mount: true } }));

    render(
      comQueryClient(
        <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />,
      ),
    );

    expect(await screen.findByText('CORE_LOAD_FAILED')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});

describe('EmulatorPlayer — nuvem após gravar', () => {
  it('liga a galeria e o atalho F2 ao upload automático com o identificador da biblioteca', async () => {
    const storage = new MemorySaveStorage();
    const hash = 'd'.repeat(64);
    const id = '11111111-1111-4111-8111-111111111111';
    const envios: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') {
          envios.push(url);
          return new Response(
            JSON.stringify({
              status: 'gravado',
              revision: envios.length,
              sizeBytes: 4,
              updatedAt: new Date().toISOString(),
            }),
          );
        }
        return new Response(JSON.stringify({ slots: [] }));
      }),
    );
    const { registry } = bancada();
    render(
      comQueryClient(
        <EmulatorPlayer
          systemId="snes"
          rom={ROM}
          titulo="Teste"
          romId={hash}
          romIdNaBiblioteca={id}
          registry={registry}
          sincronizarSaveStateNaNuvem
          saveStateStorage={storage}
        />,
      ),
    );
    await screen.findByText('rodando');
    await waitFor(() => expect(screen.getByText('memory')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Gravar no slot B' }));
    await waitFor(() => expect(envios).toHaveLength(1));
    expect(envios[0]).toContain(`/api/progress/state/${id}/1`);
    expect(await storage.read(stateKey(hash, 1))).not.toBeNull();
    const palco = screen.getByRole('application');
    fireEvent.focus(palco);
    fireEvent.keyDown(palco, { code: 'F2' });
    await waitFor(() => expect(envios).toHaveLength(2));
    expect(envios[1]).toContain(`/api/progress/state/${id}/0`);
  });
});
