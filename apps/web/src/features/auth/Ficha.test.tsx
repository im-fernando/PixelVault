// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Caixa, Campo } from './Ficha.js';

afterEach(cleanup);

describe('campos de autenticação', () => {
  it('permite conferir e ocultar a senha preservando valor e sem enviar o formulário', () => {
    const enviar = vi.fn((evento: React.FormEvent) => evento.preventDefault());
    render(
      <form onSubmit={enviar}>
        <Campo name="password" type="password" rotulo="Senha" autoComplete="current-password" />
      </form>,
    );
    const campo = screen.getByLabelText('Senha') as HTMLInputElement;
    fireEvent.change(campo, { target: { value: 'senha-de-teste' } });
    expect(campo.type).toBe('password');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar senha: Senha' }));
    expect(campo.type).toBe('text');
    expect(campo.value).toBe('senha-de-teste');
    fireEvent.click(screen.getByRole('button', { name: 'Ocultar senha: Senha' }));
    expect(campo.type).toBe('password');
    expect(campo.value).toBe('senha-de-teste');
    expect(enviar).not.toHaveBeenCalled();
  });
  it('mantém os erros associados ao campo e ao aceite dos termos', () => {
    render(
      <>
        <Campo rotulo="E-mail" type="email" erro="Informe um e-mail válido" />
        <Caixa erro="Aceite os termos">Aceito os termos</Caixa>
      </>,
    );
    for (const campo of [screen.getByRole('textbox'), screen.getByRole('checkbox')]) {
      expect(campo.getAttribute('aria-invalid')).toBe('true');
      expect(
        document.getElementById(campo.getAttribute('aria-describedby')!)?.textContent,
      ).toBeTruthy();
    }
    expect(screen.queryByRole('button')).toBeNull();
  });
});
