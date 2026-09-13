// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { moverFoco } from './foco-do-console.js';

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

it('segue a disposição visual em duas linhas e recupera foco perdido', () => {
  const botoes = Array.from({ length: 4 }, (_, i) => {
    const botao = document.createElement('button');
    document.body.append(botao);
    vi.spyOn(botao, 'getBoundingClientRect').mockReturnValue({
      x: (i % 2) * 200,
      y: Math.floor(i / 2) * 100,
      width: 100,
      height: 50,
    } as DOMRect);
    return botao;
  });
  moverFoco(botoes, 'down');
  expect(document.activeElement).toBe(botoes[0]);
  moverFoco(botoes, 'down');
  expect(document.activeElement).toBe(botoes[2]);
  moverFoco(botoes, 'right');
  expect(document.activeElement).toBe(botoes[3]);
  moverFoco(botoes, 'up');
  expect(document.activeElement).toBe(botoes[1]);
});
