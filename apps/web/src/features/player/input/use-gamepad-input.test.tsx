// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeituraDoControle } from './gamepad-map.js';
import type { EstadoDoGamepad } from './snes-keymap.js';
import { useGamepadInput } from './use-gamepad-input.js';

const ID = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';

function controle(apertados: readonly number[] = []): LeituraDoControle {
  const conjunto = new Set(apertados);
  return {
    index: 0,
    id: ID,
    mapping: 'standard',
    connected: true,
    buttons: Array.from({ length: 17 }, (_, indice) => ({
      pressed: conjunto.has(indice),
      value: conjunto.has(indice) ? 1 : 0,
    })),
    axes: [0, 0, 0, 0],
  };
}

let pendentes = new Map<number, FrameRequestCallback>();
let proximoQuadro = 0;

/** Um quadro de vídeo, com hora marcada — o laço real é `requestAnimationFrame`. */
function quadro(): void {
  const chamadas = [...pendentes.values()];
  pendentes = new Map();
  act(() => {
    for (const chamada of chamadas) chamada(0);
  });
}

beforeEach(() => {
  pendentes = new Map();
  proximoQuadro = 0;
  vi.stubGlobal('requestAnimationFrame', (chamada: FrameRequestCallback) => {
    proximoQuadro += 1;
    pendentes.set(proximoQuadro, chamada);
    return proximoQuadro;
  });
  // Cancelar de verdade: é o cancelamento que o teste de desmontagem mede.
  vi.stubGlobal('cancelAnimationFrame', (identificador: number) => {
    pendentes.delete(identificador);
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useGamepadInput', () => {
  function montar() {
    const aoMudar = vi.fn<(estado: EstadoDoGamepad) => void>();
    let plugados: (LeituraDoControle | null)[] = [];
    const tela = renderHook(() =>
      useGamepadInput({ ativo: true, aoMudar, lerControles: () => plugados }),
    );
    return {
      tela,
      aoMudar,
      plugar: (...leituras: (LeituraDoControle | null)[]) => {
        plugados = leituras;
      },
    };
  }

  it('sem controle plugado, não mexe em nada — o teclado segue sozinho', () => {
    const { tela, aoMudar } = montar();
    quadro();
    quadro();

    expect(tela.result.current).toBeNull();
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it('controle plugado no meio da partida aparece sem recarregar a página', () => {
    const { tela, aoMudar, plugar } = montar();
    quadro();
    expect(tela.result.current).toBeNull();

    plugar(controle());
    quadro();
    expect(tela.result.current?.nome).toBe('Xbox 360 Controller');

    plugar(controle([0]));
    quadro();
    expect(aoMudar.mock.calls.at(-1)?.[0].b).toBe(true);
  });

  it('desplugar no meio do aperto solta o botão e volta para o teclado', () => {
    const { tela, aoMudar, plugar } = montar();
    plugar(controle([15]));
    quadro();
    expect(aoMudar.mock.calls.at(-1)?.[0].right).toBe(true);

    plugar();
    quadro();

    expect(tela.result.current).toBeNull();
    expect(aoMudar.mock.calls.at(-1)?.[0].right).toBe(false);
  });

  it('o evento de conexão adianta a leitura, para o aviso não esperar o quadro', () => {
    const { tela, plugar } = montar();
    quadro();

    plugar(controle());
    act(() => {
      window.dispatchEvent(new Event('gamepadconnected'));
    });

    expect(tela.result.current?.nome).toBe('Xbox 360 Controller');
  });

  it('desmontar encerra o laço: nada continua lendo controle depois do player sair', () => {
    const { tela, aoMudar, plugar } = montar();
    quadro();
    tela.unmount();

    plugar(controle([0]));
    quadro();

    expect(aoMudar).not.toHaveBeenCalled();
  });
});
