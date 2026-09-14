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

function botao(x: number, y: number, width = 100, height = 50) {
  const el = document.createElement('button');
  document.body.append(el);
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ x, y, width, height } as DOMRect);
  return el;
}

it('mantém o foco nas bordas sem pular para outra linha ou coluna', () => {
  const elementos = [botao(0, 0), botao(200, 0), botao(0, 100), botao(200, 100)];
  elementos[1]!.focus();
  moverFoco(elementos, 'right');
  expect(document.activeElement).toBe(elementos[1]);
  moverFoco(elementos, 'up');
  expect(document.activeElement).toBe(elementos[1]);
  elementos[3]!.focus();
  moverFoco(elementos, 'down');
  expect(document.activeElement).toBe(elementos[3]);
});

it('prioriza a mesma coluna ao lado de ações largas', () => {
  const elementos = [botao(0, 0), botao(0, 100), botao(150, 20, 600, 80)];
  elementos[0]!.focus();
  moverFoco(elementos, 'down');
  expect(document.activeElement).toBe(elementos[1]);
  moverFoco(elementos, 'right');
  expect(document.activeElement).toBe(elementos[2]);
});

it('ignora controles desabilitados, ocultos e inertes', () => {
  const elementos = Array.from({ length: 5 }, (_, i) => botao(0, i * 100));
  elementos[1]!.disabled = true;
  elementos[2]!.hidden = true;
  elementos[3]!.setAttribute('inert', '');
  elementos[0]!.focus();
  moverFoco(elementos, 'down');
  expect(document.activeElement).toBe(elementos[4]);
});
