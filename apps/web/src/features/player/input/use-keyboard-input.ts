import { useEffect, useMemo, useRef, type RefObject } from 'react';
import { EntradaDeTeclado } from './keyboard-input.js';
import type { EstadoDoGamepad } from './snes-keymap.js';

export interface OpcoesDoTeclado {
  /** Elemento focável que representa o console. Sem foco nele, o teclado é do site. */
  readonly alvo: RefObject<HTMLElement | null>;
  /** Controle ligado. Falso com o jogo pausado ou a aba oculta. */
  readonly ativo: boolean;
  readonly aoMudar: (estado: EstadoDoGamepad) => void;
  /** Atalhos do HUD, por `KeyboardEvent.code`. Valem mesmo com o controle desligado. */
  readonly atalhos?: Readonly<Record<string, () => void>> | undefined;
}

/**
 * Liga o teclado ao console — e só enquanto o console tem o foco.
 *
 * Os ouvintes ficam no elemento do player, não em `window`. É o que faz o
 * `preventDefault` das setas parar de existir no resto do site: fora dali, o
 * evento nem chega aqui. Sair do foco devolve o teclado ao navegador, e solta
 * o que estava pressionado — senão o personagem continua correndo enquanto a
 * pessoa usa o Tab para chegar no botão de salvar.
 */
export function useKeyboardInput({ alvo, ativo, aoMudar, atalhos }: OpcoesDoTeclado): void {
  const aoMudarRef = useRef(aoMudar);
  aoMudarRef.current = aoMudar;

  const atalhosRef = useRef<Readonly<Record<string, () => void>>>(atalhos ?? {});
  atalhosRef.current = atalhos ?? {};

  const entrada = useMemo(
    () => new EntradaDeTeclado({ aoMudar: (estado) => aoMudarRef.current(estado) }),
    [],
  );

  useEffect(() => {
    entrada.definirAtiva(ativo);
  }, [entrada, ativo]);

  useEffect(() => {
    const elemento = alvo.current;
    if (elemento === null) return;

    const aoPressionar = (evento: KeyboardEvent): void => {
      const atalho = atalhosRef.current[evento.code];
      if (atalho !== undefined && !evento.ctrlKey && !evento.metaKey && !evento.altKey) {
        evento.preventDefault();
        if (!evento.repeat) atalho();
        return;
      }
      entrada.pressionar(evento);
    };

    const aoSoltar = (evento: KeyboardEvent): void => {
      entrada.soltar(evento);
    };

    const aoPerderFoco = (): void => entrada.soltarTudo();

    elemento.addEventListener('keydown', aoPressionar);
    elemento.addEventListener('keyup', aoSoltar);
    elemento.addEventListener('focusout', aoPerderFoco);
    window.addEventListener('blur', aoPerderFoco);

    return () => {
      elemento.removeEventListener('keydown', aoPressionar);
      elemento.removeEventListener('keyup', aoSoltar);
      elemento.removeEventListener('focusout', aoPerderFoco);
      window.removeEventListener('blur', aoPerderFoco);
      entrada.soltarTudo();
    };
  }, [alvo, entrada]);
}
