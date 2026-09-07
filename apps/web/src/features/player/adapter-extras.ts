import type { EmulatorAdapter } from '@pixelvault/emulator-runtime';
import type { BotaoDoSnes } from './input/snes-keymap.js';

/**
 * Capacidades que o `EmulatorAdapter` ainda não descreve.
 *
 * O volume saiu daqui: o contrato passou a expor `adapter.audio`, e o player
 * usa direto. Restou o estado de botão — e sobre ele há uma ressalva
 * importante: `setButtonState` não existe em adapter nenhum, então
 * `suportaEntrada` é sempre falso hoje. O teclado e o controle funcionam
 * porque o RetroArch escuta os eventos do DOM por conta própria, não porque
 * nós enviemos algo. Ver a issue #36.
 */

export interface AdapterComEntrada {
  setButtonState(botao: BotaoDoSnes, pressionado: boolean): void;
}

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

export function suportaEntrada(
  adapter: EmulatorAdapter,
): adapter is EmulatorAdapter & AdapterComEntrada {
  return temMetodo(adapter, 'setButtonState');
}

export function temRelogioManual(
  adapter: EmulatorAdapter,
): adapter is EmulatorAdapter & AdapterComRelogioManual {
  return temMetodo(adapter, 'advanceFrames');
}
