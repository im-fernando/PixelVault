import { describe, expect, it, vi } from 'vitest';
import { EntradaDeTeclado, type EventoDeTecla } from './keyboard-input.js';
import type { EstadoDoGamepad } from './snes-keymap.js';

function tecla(code: string, extras: Partial<EventoDeTecla> = {}): EventoDeTecla {
  return {
    code,
    repeat: false,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    target: null,
    preventDefault: vi.fn(),
    ...extras,
  };
}

function entradaAtiva(aoMudar?: (estado: EstadoDoGamepad) => void): EntradaDeTeclado {
  const entrada = new EntradaDeTeclado(aoMudar ? { aoMudar } : {});
  entrada.definirAtiva(true);
  return entrada;
}

describe('EntradaDeTeclado', () => {
  it('correr e pular ao mesmo tempo: duas teclas ficam pressionadas juntas', () => {
    const entrada = entradaAtiva();
    entrada.pressionar(tecla('ArrowRight'));
    entrada.pressionar(tecla('KeyZ'));

    const estado = entrada.estado();
    expect(estado.right).toBe(true);
    expect(estado.b).toBe(true);
    expect(estado.left).toBe(false);
  });

  it('soltar um botão não solta o outro', () => {
    const entrada = entradaAtiva();
    entrada.pressionar(tecla('ArrowRight'));
    entrada.pressionar(tecla('KeyZ'));
    entrada.soltar(tecla('KeyZ'));

    expect(entrada.estado()).toMatchObject({ right: true, b: false });
  });

  it('dá preventDefault nas teclas capturadas — seta não rola a página', () => {
    const entrada = entradaAtiva();
    const evento = tecla('ArrowDown');
    expect(entrada.pressionar(evento)).toBe(true);
    expect(evento.preventDefault).toHaveBeenCalled();
  });

  it('não captura tecla fora do mapa: Tab continua navegando pelo site', () => {
    const entrada = entradaAtiva();
    const evento = tecla('Tab');
    expect(entrada.pressionar(evento)).toBe(false);
    expect(evento.preventDefault).not.toHaveBeenCalled();
  });

  it('não captura com Ctrl, Meta ou Alt — atalho do navegador é do navegador', () => {
    const entrada = entradaAtiva();
    for (const modificador of ['ctrlKey', 'metaKey', 'altKey'] as const) {
      const evento = tecla('KeyW', { [modificador]: true });
      expect(entrada.pressionar(evento)).toBe(false);
      expect(evento.preventDefault).not.toHaveBeenCalled();
    }
  });

  it('não captura quando o foco está num campo de texto', () => {
    const entrada = entradaAtiva();
    const evento = tecla('KeyZ', { target: { tagName: 'INPUT' } as unknown as EventTarget });
    expect(entrada.pressionar(evento)).toBe(false);
  });

  it('desligada, ignora tudo — é o que acontece com a aba oculta ou o jogo pausado', () => {
    const entrada = new EntradaDeTeclado();
    const evento = tecla('KeyZ');
    expect(entrada.pressionar(evento)).toBe(false);
    expect(evento.preventDefault).not.toHaveBeenCalled();
  });

  it('desligar solta o que estava pressionado, para o jogo não andar sozinho', () => {
    const entrada = entradaAtiva();
    entrada.pressionar(tecla('ArrowRight'));
    entrada.definirAtiva(false);
    expect(entrada.estado().right).toBe(false);
  });

  it('avisa a mudança uma vez só, ignorando a repetição do sistema operacional', () => {
    const aoMudar = vi.fn();
    const entrada = entradaAtiva(aoMudar);

    entrada.pressionar(tecla('KeyX'));
    entrada.pressionar(tecla('KeyX', { repeat: true }));
    entrada.pressionar(tecla('KeyX', { repeat: true }));

    expect(aoMudar).toHaveBeenCalledTimes(1);
  });
});
