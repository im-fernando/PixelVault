// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConsoleGameStatus } from './ConsoleGameStatus.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('permite tentar novamente e voltar por joystick sem consumir o botão de entrada', () => {
  vi.useFakeTimers();
  const buttons = Array.from({ length: 17 }, (_, i) => ({ pressed: i === 0 }));
  vi.stubGlobal('navigator', {
    getGamepads: () => [
      { id: 'Xbox', index: 0, connected: true, mapping: 'standard', buttons, axes: [0, 0] },
    ],
  });
  const sair = vi.fn();
  const tentar = vi.fn();
  render(
    <ConsoleGameStatus titulo="Erro" detalhe="Falha ao carregar" sair={sair} tentar={tentar} />,
  );
  const quadro = (...indices: number[]) =>
    act(() => {
      buttons.forEach((b, i) => {
        b.pressed = indices.includes(i);
      });
      vi.advanceTimersByTime(40);
    });
  quadro(0);
  expect(tentar).not.toHaveBeenCalled();
  quadro();
  quadro(13);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Tentar novamente' }));
  quadro();
  quadro(0);
  quadro(0);
  expect(tentar).toHaveBeenCalledOnce();
  quadro();
  quadro(13);
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Voltar ao console' }));
  quadro();
  quadro(1);
  expect(sair).toHaveBeenCalledOnce();
});
