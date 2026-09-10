import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PerfilDoControle } from './gamepad-map.js';
import { combinarEstados, gamepadSolto, type EstadoDoGamepad } from './snes-keymap.js';
import { useGamepadInput } from './use-gamepad-input.js';
import { useKeyboardInput } from './use-keyboard-input.js';

export interface OpcoesDaEntrada {
  /** Elemento focável que representa o console. Sem foco nele, o teclado é do site. */
  readonly alvo: RefObject<HTMLElement | null>;
  /** O teclado vale com o console focado. */
  readonly tecladoAtivo: boolean;
  /** O controle vale com o jogo andando — foco não entra na conta. */
  readonly controleAtivo: boolean;
  /**
   * Recebe o estado combinado. Só é chamado quando algum botão muda.
   *
   * Opcional: o teclado dirige o core direto (ADR 0023), então quem só
   * precisa do estado para desenhar a legenda lê o retorno do hook — não
   * precisa deste callback.
   */
  readonly aoMudar?: ((estado: EstadoDoGamepad) => void) | undefined;
  readonly atalhos?: Readonly<Record<string, () => void>> | undefined;
  readonly aoConectarControle?: ((perfil: PerfilDoControle) => void) | undefined;
  readonly aoDesconectarControle?: ((perfil: PerfilDoControle) => void) | undefined;
}

export interface EntradaDoJogador {
  /** O que o console vê: teclado e controle somados. */
  readonly estado: EstadoDoGamepad;
  /** O controle em uso, para a UI dizer qual é. `null` é o teclado sozinho. */
  readonly controle: PerfilDoControle | null;
}

/**
 * As duas fontes de entrada, e uma só saída para o console.
 *
 * O console tem doze botões e não tem opinião sobre de onde eles vieram. Se
 * cada fonte escrevesse direto no core, a última a falar apagaria a outra:
 * encostar no teclado com o controle na mão soltaria o direcional, e soltar uma
 * tecla soltaria o botão que o controle ainda segura. Somar aqui, num lugar só,
 * é o que faz teclado e controle conviverem — e é o que faz o fallback para
 * teclado, quando o controle some, ser literalmente nada acontecendo.
 */
export function useEntradaDoJogador({
  alvo,
  tecladoAtivo,
  controleAtivo,
  aoMudar,
  atalhos,
  aoConectarControle,
  aoDesconectarControle,
}: OpcoesDaEntrada): EntradaDoJogador {
  const [doTeclado, setDoTeclado] = useState<EstadoDoGamepad>(gamepadSolto);
  const [doControle, setDoControle] = useState<EstadoDoGamepad>(gamepadSolto);

  useKeyboardInput({ alvo, ativo: tecladoAtivo, aoMudar: setDoTeclado, atalhos });

  const controle = useGamepadInput({
    ativo: controleAtivo,
    aoMudar: setDoControle,
    aoConectar: aoConectarControle,
    aoDesconectar: aoDesconectarControle,
  });

  const estado = useMemo(() => combinarEstados(doTeclado, doControle), [doTeclado, doControle]);

  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;
  useEffect(() => {
    aoMudarRef.current?.(estado);
  }, [estado]);

  return { estado, controle };
}
