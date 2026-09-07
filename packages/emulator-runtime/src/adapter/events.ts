import type { SystemId } from '@pixelvault/contracts';
import type { EmulatorError } from './errors.js';
import type { EmulatorStatus } from './status.js';

/**
 * Eventos que qualquer adapter emite, com o payload de cada um.
 *
 * O mapa existe para o `on` ser tipado: `on('sramChange', h)` já sabe o que
 * `h` recebe, e trocar o payload de um evento vira erro de compilação em todo
 * consumidor, em vez de `undefined` em produção.
 *
 * A lista é curta de propósito. Cada evento aqui é um contrato que todo core
 * futuro — Mega Drive, Game Boy, PlayStation — vai ter que honrar.
 */
export interface EmulatorEventMap {
  /** Toda transição de ciclo de vida. É o que a UI usa para desabilitar botão. */
  statusChange: { readonly previous: EmulatorStatus; readonly current: EmulatorStatus };
  /** ROM carregada e máquina montada, ainda parada. */
  ready: { readonly systemId: SystemId; readonly coreVersion: string };
  /**
   * O jogo escreveu na SRAM. É o gatilho do save automático — sem ele, o
   * cliente só pode sincronizar por relógio, e relógio perde partida.
   */
  sramChange: { readonly byteLength: number };
  /**
   * Amostra de desempenho. Emitido no máximo uma vez por segundo: evento por
   * quadro a 60 Hz custaria mais que a emulação. Emissão é o melhor esforço —
   * core que não sabe medir simplesmente não emite.
   */
  fps: { readonly fps: number };
  /** Falha assíncrona, fora de qualquer chamada. Perda de contexto WebGL, core que morreu. */
  error: { readonly error: EmulatorError };
}

export type EmulatorEvent = keyof EmulatorEventMap;

export type EmulatorEventPayload<E extends EmulatorEvent> = EmulatorEventMap[E];

export type EmulatorEventHandler<E extends EmulatorEvent> = (payload: EmulatorEventMap[E]) => void;

/** Cancela a inscrição feita por `on`. Devolvido para caber em `useEffect`. */
export type Unsubscribe = () => void;
