import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from 'react';
import { SONS_DO_CONSOLE, SonsDoConsole, type SomDoConsole } from './sons-do-console.js';
import type { PreferenciasConsole } from './temas.js';

const banco = new SonsDoConsole();
export const ContextoSonoroConsole = createContext<(som: SomDoConsole) => void>(() => undefined);
export const useSomDoConsole = () => useContext(ContextoSonoroConsole);

export function useSonsDoConsole(preferencias: PreferenciasConsole) {
  const [bloqueado, setBloqueado] = useState(false);
  const atual = useRef(preferencias);
  atual.current = preferencias;
  const montado = useRef(false);
  const sonsAnteriores = useRef(preferencias.sons);
  useEffect(() => {
    montado.current = true;
    const liberar = banco.usar();
    const aoOcultar = () => {
      if (document.visibilityState === 'hidden') banco.silenciar();
    };
    document.addEventListener('visibilitychange', aoOcultar);
    return () => {
      montado.current = false;
      liberar();
      document.removeEventListener('visibilitychange', aoOcultar);
    };
  }, []);
  useEffect(() => {
    banco.configurar(preferencias.tema, preferencias.sons);
    if (preferencias.sons && !sonsAnteriores.current) void banco.tocar('confirmar');
    sonsAnteriores.current = preferencias.sons;
  }, [preferencias.tema, preferencias.sons]);

  const tocar = useCallback((som: SomDoConsole) => {
    banco.configurar(atual.current.tema, atual.current.sons);
    void banco.tocar(som).then((resultado) => {
      if (montado.current) setBloqueado(resultado === 'bloqueado');
    });
  }, []);
  const aoClicar = useCallback(
    (evento: MouseEvent<HTMLElement>) => {
      const alvo = evento.target instanceof Element ? evento.target.closest('button, a') : null;
      if (!alvo || alvo.matches(':disabled, [aria-disabled="true"]') || alvo.closest('[inert]'))
        return;
      const som = alvo.getAttribute('data-console-sound');
      if (som === 'nenhum') return;
      tocar(SONS_DO_CONSOLE.includes(som as SomDoConsole) ? (som as SomDoConsole) : 'confirmar');
    },
    [tocar],
  );
  return { tocar, aoClicar, bloqueado: preferencias.sons && bloqueado };
}
