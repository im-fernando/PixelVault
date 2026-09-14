import { moverFoco } from './foco-do-console.js';
import { criarRepeticaoDoDirecional } from './teclado-do-console.js';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';
import {
  perfilDoControle,
  traduzirControle,
  type PerfilDoControle,
} from '../player/input/gamepad-map.js';
import { gamepadSolto, type EstadoDoGamepad } from '../player/input/snes-keymap.js';
import { useSomDoConsole } from './use-sons-do-console.js';

// Trava máxima de "botão que fechou o menu ainda segurado": passado esse tempo,
// retoma de qualquer jeito — nunca depender só do botão soltar (controle
// fantasma ou outro gamepad plugado pode nunca reportar solto).
const LIMITE_RETOMADA_PENDENTE_MS = 1500;

function elementosDoMenu(): HTMLElement[] {
  const raiz =
    document.querySelector('[data-console-game-dialog] [role="alertdialog"]') ??
    document.querySelector('[data-console-game-dialog]');
  return Array.from(
    raiz?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? [],
  ).filter((elemento) => !elemento.closest('[inert]'));
}

function mover(direcao: 'left' | 'right' | 'up' | 'down') {
  moverFoco(elementosDoMenu(), direcao);
}

export function useConsoleGameMenu({
  ativo,
  ps1 = false,
  disponivel,
  bloqueado,
  impedirRetomada,
  pausar,
  retomar,
  palco,
}: {
  ativo: boolean;
  ps1?: boolean;
  disponivel: boolean;
  bloqueado: boolean;
  impedirRetomada: boolean;
  pausar: () => void;
  retomar: () => void;
  palco: RefObject<HTMLElement | null>;
}) {
  const tocar = useSomDoConsole();
  const [aberto, setAberto] = useState(false);
  const abertoRef = useRef(false);
  const retomarPendente = useRef(false);
  const retomarPendenteDesde = useRef(0);
  const padAtualRef = useRef<Gamepad | null>(null);
  const atual = useRef({ disponivel, bloqueado, impedirRetomada, pausar, retomar });
  atual.current = { disponivel, bloqueado, impedirRetomada, pausar, retomar };

  const abrir = useCallback(() => {
    if (!atual.current.disponivel || abertoRef.current) return;
    atual.current.pausar();
    tocar('abrir');
    abertoRef.current = true;
    setAberto(true);
  }, [tocar]);
  const concluirRetomada = useCallback(() => {
    if (
      !abertoRef.current ||
      atual.current.bloqueado ||
      atual.current.impedirRetomada ||
      document.visibilityState === 'hidden'
    )
      return;
    retomarPendente.current = false;
    abertoRef.current = false;
    setAberto(false);
    tocar('voltar');
    atual.current.retomar();
    palco.current?.focus({ preventScroll: true });
  }, [palco, tocar]);
  const fechar = useCallback(() => {
    if (atual.current.bloqueado || atual.current.impedirRetomada) return;
    const cancelar = document.querySelector<HTMLButtonElement>('[data-console-cancel]');
    if (cancelar) {
      cancelar.click();
      return;
    }
    // Só olha o gamepad realmente em uso no menu — nunca todos os conectados,
    // senão um segundo controle ou dispositivo fantasma trava isso pra sempre.
    const segurando = padAtualRef.current?.buttons.some((b) => b.pressed) ?? false;
    // O botão que fecha o menu não vira um pulo/disparo no primeiro quadro.
    if (segurando) {
      retomarPendente.current = true;
      retomarPendenteDesde.current = Date.now();
    } else concluirRetomada();
  }, [concluirRetomada]);

  useEffect(() => {
    if (!ativo) return;
    const teclado = (evento: KeyboardEvent) => {
      if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
      if (!abertoRef.current && !atual.current.disponivel) return;
      if (evento.key === 'Escape') {
        evento.preventDefault();
        evento.stopImmediatePropagation();
        if (!evento.repeat) {
          if (abertoRef.current) fechar();
          else abrir();
        }
        return;
      }
      if (!abertoRef.current) return;
      // O runtime escuta o teclado diretamente (ADR 0023). Interceptar na
      // captura impede que navegar nos saves escreva input no core pausado.
      evento.stopPropagation();
      if (evento.key.startsWith('Arrow')) {
        evento.preventDefault();
        const antes = document.activeElement;
        mover(evento.key.slice(5).toLowerCase() as 'left' | 'right' | 'up' | 'down');
        if (antes !== document.activeElement || antes instanceof HTMLInputElement) tocar('navegar');
      } else if (evento.key === 'Tab') {
        evento.preventDefault();
        const elementos = elementosDoMenu();
        const indice = elementos.indexOf(document.activeElement as HTMLElement);
        elementos[
          (indice + (evento.shiftKey ? -1 : 1) + elementos.length) % elementos.length
        ]?.focus();
        if (elementos.length > 1) tocar('navegar');
      } else if (evento.key === 'Enter' || evento.key === ' ') {
        evento.preventDefault();
        if (!evento.repeat && document.activeElement instanceof HTMLElement)
          document.activeElement.click();
      }
    };
    window.addEventListener('keydown', teclado, true);
    let quadro = 0;
    let armado = true;
    const repetir = criarRepeticaoDoDirecional();
    let perfil: PerfilDoControle | null = null;
    let anterior: EstadoDoGamepad = gamepadSolto();
    const consultar = () => {
      const controles = Array.from(navigator.getGamepads?.() ?? []);
      const pad = controles.find((p) => p?.connected);
      padAtualRef.current = pad ?? null;
      if (document.visibilityState !== 'hidden') {
        if (
          retomarPendente.current &&
          (!pad?.buttons.some((b) => b.pressed) ||
            Date.now() - retomarPendenteDesde.current > LIMITE_RETOMADA_PENDENTE_MS)
        )
          concluirRetomada();
        if (pad) {
          if (perfil?.id !== pad.id || perfil.index !== pad.index)
            perfil = perfilDoControle(pad, ps1);
          const estado = traduzirControle(pad, perfil);
          const l1 = ps1 ? estado.select : estado.l;
          const r1 = ps1 ? estado.start : estado.r;
          const direcao = repetir(
            abertoRef.current && !retomarPendente.current && !atual.current.bloqueado
              ? ((['left', 'right', 'up', 'down'] as const).find((dir) => estado[dir]) ?? null)
              : null,
            performance.now(),
          );
          if (!l1 && !r1) armado = true;
          if (l1 && r1 && armado) {
            armado = false;
            if (abertoRef.current) fechar();
            else abrir();
          } else if (abertoRef.current && !retomarPendente.current && !atual.current.bloqueado) {
            if (estado.a && !anterior.a) fechar();
            else if (
              estado.b &&
              !anterior.b &&
              document.activeElement instanceof HTMLElement &&
              elementosDoMenu().includes(document.activeElement)
            )
              document.activeElement.click();
            else if (direcao) {
              const antes = document.activeElement;
              mover(direcao);
              if (antes !== document.activeElement || antes instanceof HTMLInputElement)
                tocar('navegar');
            }
          }
          anterior = estado;
        } else {
          repetir(null, 0);
          anterior = gamepadSolto();
          perfil = null;
          armado = true;
        }
      }
      quadro = window.requestAnimationFrame(consultar);
    };
    quadro = window.requestAnimationFrame(consultar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener('keydown', teclado, true);
    };
  }, [ativo, abrir, fechar, concluirRetomada, tocar, ps1]);
  return { aberto, abrir, fechar };
}
