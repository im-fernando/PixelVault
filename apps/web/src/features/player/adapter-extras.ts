import type { EmulatorAdapter } from '@pixelvault/emulator-runtime';

/**
 * Capacidades que o `EmulatorAdapter` ainda não descreve.
 *
 * O volume saiu daqui: o contrato passou a expor `adapter.audio`, e o player
 * usa direto. Não existe (nem vai existir) um `setButtonState`: a issue #36 e
 * a ADR 0023 decidiram que o input não entra por estado enviado por quadro —
 * o teclado dirige o core direto, com o `retroarchConfig` do boot garantindo
 * que o mapa que a UI mostra é o mesmo que o core obedece. Ver
 * `packages/emulator-runtime/src/snes/keyboard-bindings.ts`.
 */

/**
 * Adapter cujo relógio não anda sozinho.
 *
 * O adapter falso é assim de propósito — tempo explícito é o que impede teste
 * que pisca. Num player de verdade alguém precisa ser esse relógio, e é o
 * player, porque é ele que tem `requestAnimationFrame`.
 */
export interface AdapterComRelogioManual {
  advanceFrames(quadros?: number): void;
}

function temMetodo(adapter: EmulatorAdapter, nome: string): boolean {
  return typeof (adapter as unknown as Record<string, unknown>)[nome] === 'function';
}

export function temRelogioManual(
  adapter: EmulatorAdapter,
): adapter is EmulatorAdapter & AdapterComRelogioManual {
  return temMetodo(adapter, 'advanceFrames');
}
