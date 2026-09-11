// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EmulatorRegistry, romFromUrl } from '@pixelvault/emulator-runtime';
import { FakeAdapter, type FakeAdapterOptions } from '@pixelvault/emulator-runtime/testing';
import { EmulatorPlayer } from '../player/EmulatorPlayer.js';
import { entrarEmTelaCheiaDoConsole } from './tela-cheia.js';

const ROM = romFromUrl('/roms/sure-instinct/sure-instinct.sfc', { fileName: 'sure-instinct.sfc' });
let quadros: Map<number, FrameRequestCallback>;
let sequencia = 0;
const buttons = Array.from({ length: 17 }, () => ({ pressed: false, value: 0 }));
const pad = {
  index: 0,
  id: 'Xbox Controller',
  mapping: 'standard',
  connected: true,
  buttons,
  axes: [0, 0],
};

beforeEach(() => {
  quadros = new Map();
  buttons.forEach((b) => {
    b.pressed = false;
    b.value = 0;
  });
  vi.stubGlobal('indexedDB', new IDBFactory());
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    const id = ++sequencia;
    quadros.set(id, callback);
    return id;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => quadros.delete(id));
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [pad] });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function controle(...pressionados: number[]) {
  await act(async () => {
    buttons.forEach((b, i) => {
      b.pressed = pressionados.includes(i);
      b.value = b.pressed ? 1 : 0;
    });
    const callbacks = [...quadros.values()];
    quadros.clear();
    callbacks.forEach((callback) => callback(performance.now()));
  });
}

async function montar(options: FakeAdapterOptions = {}) {
  const registry = new EmulatorRegistry();
  const adapter = new FakeAdapter(options);
  registry.register('snes', () => adapter);
  const sair = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <EmulatorPlayer
        systemId="snes"
        titulo="Sure Instinct"
        rom={ROM}
        romId={'a'.repeat(64)}
        registry={registry}
        modoConsole={{ capaUrl: null, aoSair: sair, progresso: <p>Progresso da conta</p> }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(adapter.status).toBe('running'));
  return { adapter, sair };
}

describe('partida no modo console', () => {
  it('inicia imersiva, pausa por Esc e isola o teclado do core durante o menu', async () => {
    const { adapter } = await montar();
    expect(screen.getByRole('application').classList.contains('cgp-stage')).toBe(true);
    expect(screen.queryByLabelText('Mapeamento do teclado')).toBeNull();
    expect(screen.queryByText('rodando')).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(adapter.status).toBe('paused');
    expect(screen.getByRole('dialog', { name: 'Menu do console' })).toBeTruthy();
    const entradaNativa = vi.fn();
    document.addEventListener('keydown', entradaNativa);
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown', code: 'ArrowDown' });
    expect(entradaNativa).not.toHaveBeenCalled();
    document.removeEventListener('keydown', entradaNativa);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(adapter.status).toBe('running');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('application'));
  });

  it('L1 + R1 só alterna uma vez e aguarda soltar os botões antes de retomar', async () => {
    const { adapter } = await montar();
    await controle(4);
    expect(adapter.status).toBe('running');
    await controle(4, 5);
    expect(adapter.status).toBe('paused');
    await controle(4, 5);
    expect(screen.getByRole('dialog')).toBeTruthy();
    await controle();
    await controle(4, 5);
    expect(adapter.status).toBe('paused');
    await controle(5);
    expect(adapter.status).toBe('paused');
    await controle();
    expect(adapter.status).toBe('running');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('salva e restaura o estado real sem sair da pausa; sobrescrita exige confirmação', async () => {
    const { adapter } = await montar();
    act(() => adapter.advanceFrames(45));
    fireEvent.click(screen.getByRole('button', { name: 'Abrir menu do console' }));
    fireEvent.click(screen.getByRole('button', { name: 'Estados salvos' }));
    const salvar = screen.getByRole('button', { name: 'Salvar no slot 1' });
    await waitFor(() => expect(salvar.hasAttribute('disabled')).toBe(false));
    expect(screen.getByRole('button', { name: 'Carregar slot 1' }).hasAttribute('disabled')).toBe(
      true,
    );
    fireEvent.click(salvar);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(adapter.status).toBe('paused');
    expect(await screen.findByText('Estado salvo no slot 1.')).toBeTruthy();
    expect(adapter.status).toBe('paused');
    fireEvent.click(salvar);
    expect(screen.getByRole('alertdialog', { name: 'Substituir o slot 1?' })).toBeTruthy();
    const cancelar = screen.getByRole('button', { name: 'Cancelar' });
    expect(document.activeElement).toBe(cancelar);
    fireEvent.keyDown(cancelar, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Substituir estado' }));
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(cancelar);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(adapter.status).toBe('paused');
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => adapter.advanceFrames(25));
    expect(adapter.frameCount).toBe(70);
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Estados salvos' }));
    fireEvent.click(screen.getByRole('button', { name: 'Carregar slot 1' }));
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Carregar estado' }),
    );
    expect(await screen.findByText('Estado do slot 1 restaurado.')).toBeTruthy();
    expect(adapter.frameCount).toBe(45);
    expect(adapter.status).toBe('paused');
  });

  it('retorno do controle cancela a confirmação, não a pausa', async () => {
    const { adapter, sair } = await montar();
    await controle(4, 5);
    await controle();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao console' }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    await controle(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(adapter.status).toBe('paused');
    expect(sair).not.toHaveBeenCalled();
  });

  it('espera a bateria ser persistida antes de voltar à biblioteca', async () => {
    const { adapter, sair } = await montar();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Estados salvos' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Salvar no slot 1' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.keyDown(window, { key: 'Escape' });
    act(() => adapter.advanceFrames(60));
    const exportar = vi.spyOn(adapter, 'exportSram');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao console' }));
    expect(sair).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Voltar ao console' }),
    );
    await waitFor(() => expect(sair).toHaveBeenCalledOnce());
    expect(exportar).toHaveBeenCalled();
  });

  it('esconde slots sem suporte do core e mantém ajustes funcionais', async () => {
    const { adapter } = await montar({ capabilities: { saveState: false, sram: true } });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('button', { name: 'Estados salvos' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Imagem e som' }));
    fireEvent.click(screen.getByRole('button', { name: '8:7' }));
    expect(screen.getByRole('button', { name: '8:7' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.change(screen.getByRole('slider', { name: 'Volume do jogo' }), {
      target: { value: '35' },
    });
    await waitFor(() => expect(adapter.audio.volume).toBe(0.35));
    screen.getByRole('slider', { name: 'Volume do jogo' }).focus();
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
    await waitFor(() => expect(adapter.audio.volume).toBe(0.4));
    fireEvent.click(screen.getByRole('button', { name: /Silenciar jogo/ }));
    expect(adapter.audio.muted).toBe(true);
  });

  it('reinicia somente depois de confirmar e continua pausado', async () => {
    const { adapter } = await montar();
    act(() => adapter.advanceFrames(35));
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Reiniciar jogo' }));
    expect(adapter.frameCount).toBe(35);
    fireEvent.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Reiniciar jogo' }),
    );
    await waitFor(() => expect(adapter.frameCount).toBe(0));
    expect(adapter.status).toBe('paused');
    expect(screen.getByRole('dialog')).toBeTruthy();
  });

  it('botão inferior abre os saves pelo atalho e preserva o foco no menu', async () => {
    const { adapter } = await montar();
    await controle(4, 5);
    await controle();
    fireEvent.click(screen.getByRole('button', { name: 'Estados salvos' }));
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Salvar no slot 1' }).hasAttribute('disabled'),
      ).toBe(false),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sua sessão' }));
    screen.getByRole('button', { name: /Salvar um momento/ }).focus();
    await controle(0);
    expect(screen.getByRole('button', { name: 'Salvar no slot 4' })).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Salvar no slot 1' }));
    expect(adapter.status).toBe('paused');
  });
});

describe('tela cheia do console', () => {
  it('pede fullscreen na raiz que sobrevive à troca de rota', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: requestFullscreen,
    });
    expect(await entrarEmTelaCheiaDoConsole()).toBe(true);
    expect(requestFullscreen).toHaveBeenCalledOnce();
  });
  it('recusa do navegador não impede abrir a partida', async () => {
    Object.defineProperty(document.documentElement, 'requestFullscreen', {
      configurable: true,
      value: vi.fn().mockRejectedValue(new Error('User activation required')),
    });
    expect(await entrarEmTelaCheiaDoConsole()).toBe(false);
  });
});
