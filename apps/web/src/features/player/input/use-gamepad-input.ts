import { useEffect, useMemo, useRef, useState } from 'react';
import { EntradaDeControle, type LeituraDeControles } from './gamepad-input.js';
import type { PerfilDoControle } from './gamepad-map.js';
import type { EstadoDoGamepad } from './snes-keymap.js';

export interface OpcoesDoControle {
  /** Entrada ligada. Falso com o jogo pausado ou a aba oculta — mas a detecção continua. */
  readonly ativo: boolean;
  readonly aoMudar: (estado: EstadoDoGamepad) => void;
  readonly aoConectar?: ((perfil: PerfilDoControle) => void) | undefined;
  readonly aoDesconectar?: ((perfil: PerfilDoControle) => void) | undefined;
  /** Injetável para teste. Em produção é sempre `navigator.getGamepads()`. */
  readonly lerControles?: (() => LeituraDeControles) | undefined;
}

function lerDoNavegador(): LeituraDeControles {
  if (typeof navigator === 'undefined' || typeof navigator.getGamepads !== 'function') return [];
  return navigator.getGamepads();
}

/**
 * Liga o controle ao console, e o mantém ligado durante a partida inteira.
 *
 * Duas diferenças em relação ao teclado, e as duas são de propósito:
 *
 * O laço é `requestAnimationFrame`, não `setInterval`. É o mesmo relógio que
 * desenha o quadro, então a leitura acontece no instante em que o quadro vai
 * ser produzido — e não num ritmo próprio, que ora chega cedo demais e é
 * descartado, ora chega tarde e vira atraso visível no pulo.
 *
 * O controle não depende de foco. O teclado é compartilhado com o navegador e
 * com a página, então ele só vale com o console focado; o controle não é de
 * mais ninguém. Exigir clique na tela para o controle funcionar seria inventar
 * um problema que só existe no teclado.
 */
export function useGamepadInput({
  ativo,
  aoMudar,
  aoConectar,
  aoDesconectar,
  lerControles,
}: OpcoesDoControle): PerfilDoControle | null {
  const [controle, setControle] = useState<PerfilDoControle | null>(null);

  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  const aoConectarRef = useRef(aoConectar);
  aoConectarRef.current = aoConectar;
  const aoDesconectarRef = useRef(aoDesconectar);
  aoDesconectarRef.current = aoDesconectar;
  const lerRef = useRef(lerControles ?? lerDoNavegador);
  lerRef.current = lerControles ?? lerDoNavegador;

  const entrada = useMemo(
    () =>
      new EntradaDeControle({
        aoMudar: (estado) => aoMudarRef.current(estado),
        aoConectar: (perfil) => {
          setControle(perfil);
          aoConectarRef.current?.(perfil);
        },
        aoDesconectar: (perfil) => {
          setControle(null);
          aoDesconectarRef.current?.(perfil);
        },
      }),
    [],
  );

  useEffect(() => {
    entrada.definirAtiva(ativo);
  }, [entrada, ativo]);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;

    let quadro = 0;
    const passo = (): void => {
      entrada.sincronizar(lerRef.current());
      quadro = window.requestAnimationFrame(passo);
    };
    quadro = window.requestAnimationFrame(passo);

    // A varredura por quadro já descobre controle plugado e desplugado sozinha
    // — o navegador não esconde o que `getGamepads()` devolve. Os eventos estão
    // aqui porque o quadro para de existir com a aba oculta ou minimizada: sem
    // eles, plugar o controle fora de vista só apareceria na volta.
    const acordar = (): void => entrada.sincronizar(lerRef.current());
    window.addEventListener('gamepadconnected', acordar);
    window.addEventListener('gamepaddisconnected', acordar);

    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener('gamepadconnected', acordar);
      window.removeEventListener('gamepaddisconnected', acordar);
    };
  }, [entrada]);

  return controle;
}
