import { EmulatorRegistry, type EmulatorAdapterFactory } from '@pixelvault/emulator-runtime';
import { FakeAdapter } from '@pixelvault/emulator-runtime/testing';
import type { SystemId } from '@pixelvault/contracts';

/**
 * O registry do front: de `systemId` para o adapter que sabe emular aquele
 * console.
 *
 * O player nunca instancia adapter. Ele pede `create(systemId)` e recebe o que
 * estiver registrado — é isso que faz a tela funcionar sem alteração no dia em
 * que o core de verdade entrar, e é isso que permite o teste trocar tudo por
 * um adapter falso sem tocar em componente nenhum.
 */
export const emulatorRegistry = new EmulatorRegistry();

/**
 * Consoles que hoje rodam com o adapter de demonstração.
 *
 * O falso implementa o contrato inteiro (status, eventos, SRAM, save state),
 * mas não desenha quadro nenhum: ele existe para o ciclo de vida, o HUD e o
 * input serem construídos e verificados antes do core. A tela preta é honesta,
 * e a UI avisa isso em vez de fingir que está emulando.
 */
const EM_DEMONSTRACAO = new Set<SystemId>();

/**
 * Registra o adapter de verdade de um console.
 *
 * É a única linha que precisa mudar quando o core de SNES chegar: chame isto
 * no boot da aplicação com a fábrica do adapter real e a demonstração some
 * sozinha, sem alteração no player, no HUD ou nas rotas.
 */
export function registrarAdapter(systemId: SystemId, fabrica: EmulatorAdapterFactory): void {
  emulatorRegistry.register(systemId, fabrica, { replace: true });
  EM_DEMONSTRACAO.delete(systemId);
}

function registrarDemonstracao(systemId: SystemId): void {
  emulatorRegistry.register(systemId, () => new FakeAdapter({ systemId, coreVersion: 'demo-1' }), {
    replace: true,
  });
  EM_DEMONSTRACAO.add(systemId);
}

/** Diz à UI que o que está na tela é o adapter de demonstração, não o core. */
export function ehDemonstracao(systemId: SystemId): boolean {
  return EM_DEMONSTRACAO.has(systemId);
}

registrarDemonstracao('snes');
