// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Dialogo } from './Dialogo.js';

afterEach(cleanup);

it('prende Tab e Shift+Tab, preserva foco ao renderizar e restaura ao fechar', () => {
  const abrir = document.createElement('button');
  document.body.append(abrir);
  abrir.focus();
  document.body.style.overflow = 'auto';
  const antigo = vi.fn();
  const atual = vi.fn();
  const conteudo = (fechar: () => void) => (
    <Dialogo titulo="Teste" fechar={fechar}>
      <input aria-label="Busca" data-autofocus="" />
      <button disabled>Indisponível</button>
      <button>Confirmar</button>
    </Dialogo>
  );
  const view = render(conteudo(antigo));
  expect(document.activeElement).toBe(screen.getByRole('textbox'));
  expect(document.body.style.overflow).toBe('hidden');
  screen.getByRole('button', { name: 'Confirmar' }).focus();
  view.rerender(conteudo(atual));
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirmar' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Fechar' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Confirmar' }));
  fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
  expect(atual).toHaveBeenCalledOnce();
  expect(antigo).not.toHaveBeenCalled();
  view.unmount();
  expect(document.activeElement).toBe(abrir);
  expect(document.body.style.overflow).toBe('auto');
  abrir.remove();
  document.body.style.overflow = '';
});
