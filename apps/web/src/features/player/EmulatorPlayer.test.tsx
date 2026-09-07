// @vitest-environment jsdom
import { StrictMode } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmulatorRegistry, romFromUrl } from '@pixelvault/emulator-runtime';
import { FakeAdapter } from '@pixelvault/emulator-runtime/testing';
import { EmulatorPlayer } from './EmulatorPlayer.js';

const ROM = romFromUrl('/roms/sure-instinct/sure-instinct.sfc', {
  fileName: 'sure-instinct.sfc',
});

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
      <StrictMode>
        <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />
      </StrictMode>,
    );

    expect(await screen.findByText('rodando')).toBeTruthy();
    expect(criados.filter((adapter) => adapter.status === 'running')).toHaveLength(1);
  });

  it('vinte idas e voltas não deixam adapter vivo — nenhum contexto pendurado', async () => {
    const { registry, criados } = bancada();

    for (let i = 0; i < 20; i += 1) {
      const tela = render(
        <StrictMode>
          <EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />
        </StrictMode>,
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
    render(<EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />);
    await assentar();

    expect(screen.queryByRole('button', { name: /Salvar estado/ })).not.toBeNull();
    expect(screen.queryByRole('button', { name: /Carregar estado/ })).not.toBeNull();
  });

  it('esconde salvar estado quando o core não suporta, em vez de deixar botão quebrado', async () => {
    const { registry } = bancada({ saveState: false, sram: true });
    render(<EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />);
    await assentar();

    expect(screen.queryByRole('button', { name: /Salvar estado/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Carregar estado/ })).toBeNull();
  });

  it('a legenda do teclado mostra o mapa padrão de SNES', async () => {
    const { registry } = bancada();
    render(<EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />);
    await assentar();

    const legenda = screen.getByLabelText('Mapeamento do teclado');
    expect(legenda.textContent).toContain('Start');
    expect(legenda.textContent).toContain('Enter');
    expect(legenda.textContent).toContain('Select');
  });

  it('a tela de erro traz o código do runtime e a ação de tentar de novo', async () => {
    const registry = new EmulatorRegistry();
    registry.register('snes', () => new FakeAdapter({ failures: { mount: true } }));

    render(<EmulatorPlayer systemId="snes" rom={ROM} titulo="Sure Instinct" registry={registry} />);

    expect(await screen.findByText('CORE_LOAD_FAILED')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeTruthy();
  });
});
