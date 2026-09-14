// @vitest-environment jsdom
import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Seletor } from './Seletor.js';

afterEach(cleanup);
function Exemplo() {
  const [valor, alterar] = useState('favoritos');
  return (
    <>
      <Seletor
        rotulo="Ordenar por"
        valor={valor}
        aoAlterar={alterar}
        opcoes={[
          { valor: 'favoritos', rotulo: 'Favoritos primeiro' },
          { valor: 'nome', rotulo: 'Nome: A–Z' },
          { valor: 'tamanho', rotulo: 'Maior tamanho' },
        ]}
      />
      <button>Próximo campo</button>
    </>
  );
}

describe('Seletor', () => {
  it('percorre opções sem alterar o valor até confirmar e preserva o foco', () => {
    render(<Exemplo />);
    const campo = screen.getByRole('combobox', { name: 'Ordenar por' });
    campo.focus();
    fireEvent.keyDown(campo, { key: 'ArrowDown' });
    fireEvent.keyDown(campo, { key: 'End' });
    expect(campo.textContent).toBe('Favoritos primeiro');
    expect(document.getElementById(campo.getAttribute('aria-activedescendant')!)?.textContent).toBe(
      'Maior tamanho',
    );
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.textContent).toBe('Maior tamanho');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(campo);
  });

  it('cancela com Escape e fecha ao sair por Tab ou clicar fora', () => {
    render(<Exemplo />);
    const campo = screen.getByRole('combobox');
    fireEvent.click(campo);
    fireEvent.keyDown(campo, { key: 'End' });
    fireEvent.keyDown(campo, { key: 'Escape' });
    expect(campo.textContent).toBe('Favoritos primeiro');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(campo);
    fireEvent.keyDown(campo, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(campo);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Próximo campo' }));
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('seleciona por clique e busca uma opção digitando seu nome', () => {
    render(<Exemplo />);
    const campo = screen.getByRole('combobox');
    fireEvent.click(campo);
    fireEvent.click(screen.getByRole('option', { name: 'Nome: A–Z' }));
    expect(campo.textContent).toBe('Nome: A–Z');
    fireEvent.keyDown(campo, { key: 'm' });
    fireEvent.keyDown(campo, { key: 'Enter' });
    expect(campo.textContent).toBe('Maior tamanho');
    fireEvent.click(campo);
    expect(
      screen.getByRole('option', { name: 'Maior tamanho' }).getAttribute('aria-selected'),
    ).toBe('true');
  });
});
