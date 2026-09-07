import type { EmulatorAdapter } from '@pixelvault/emulator-runtime';
import type { BotaoDoSnes } from './input/snes-keymap.js';

/**
 * Capacidades que o `EmulatorAdapter` ainda não descreve.
 *
 * Volume e estado de botão não estão no contrato: a M1 fecha o ciclo de vida
 * primeiro, e mexer no contrato é trabalho de quem o mantém. Enquanto isso, o
 * player pergunta ao adapter se ele sabe fazer, exatamente como faz com
 * `capabilities` — e, quando não sabe, o controle correspondente **não é
 * desenhado**, em vez de virar botão que não faz nada.
 *
 * Quando o contrato absorver isto, este arquivo desaparece e o player passa a
 * ler de `capabilities`. É o único lugar do front que precisa mudar.
 */

export interface AdapterComVolume {
  setVolume(volume: number): void;
}

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

export function suportaVolume(
  adapter: EmulatorAdapter,
): adapter is EmulatorAdapter & AdapterComVolume {
  return temMetodo(adapter, 'setVolume');
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
