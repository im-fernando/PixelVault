import type {
  EmulatorEvent,
  EmulatorEventHandler,
  EmulatorEventMap,
  Unsubscribe,
} from './events.js';

/**
 * O handler guardado no mapa não tem como ser tipado por evento — a chave é
 * uma união. `(payload: never) => void` aceita qualquer handler concreto (o
 * parâmetro é contravariante) sem precisar de `any`.
 */
type HandlerOpaco = (payload: never) => void;

/**
 * Emissor tipado compartilhado pelos adapters.
 *
 * Mora no pacote, e não em cada adapter, porque a semântica difícil é a mesma
 * para todos: ouvinte que estoura não pode derrubar o laço de emulação, e a
 * lista precisa aguentar `off` durante o próprio despacho.
 */
export class EmulatorEventEmitter {
  readonly #ouvintes = new Map<EmulatorEvent, Set<HandlerOpaco>>();

  on<E extends EmulatorEvent>(event: E, handler: EmulatorEventHandler<E>): Unsubscribe {
    const inscritos = this.#ouvintes.get(event) ?? new Set<HandlerOpaco>();
    inscritos.add(handler);
    this.#ouvintes.set(event, inscritos);
    return () => {
      inscritos.delete(handler);
    };
  }

  emit<E extends EmulatorEvent>(event: E, payload: EmulatorEventMap[E]): void {
    const inscritos = this.#ouvintes.get(event);
    if (inscritos === undefined) {
      return;
    }
    // Cópia: um ouvinte pode cancelar a própria inscrição ao ser chamado.
    for (const handler of [...inscritos]) {
      try {
        (handler as EmulatorEventHandler<E>)(payload);
      } catch (erro) {
        // Engolido de propósito: quem quebra é o ouvinte, e derrubar a
        // emulação por causa dele seria trocar um bug de UI por um travamento.
        console.error(`[emulator-runtime] ouvinte de "${event}" estourou`, erro);
      }
    }
  }

  listenerCount(event: EmulatorEvent): number {
    return this.#ouvintes.get(event)?.size ?? 0;
  }

  removeAll(): void {
    this.#ouvintes.clear();
  }
}
