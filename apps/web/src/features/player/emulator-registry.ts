import { EmulatorRegistry, registrarAdapterDeSnes } from '@pixelvault/emulator-runtime';
import type { EmulatorAdapterFactory } from '@pixelvault/emulator-runtime';
import type { SystemId } from '@pixelvault/contracts';

/**
 * O registry do front: de `systemId` para o adapter que sabe emular aquele
 * console.
 *
 * O player nunca instancia adapter. Ele pede `create(systemId)` e recebe o que
 * estiver registrado — foi isso que permitiu construir e verificar HUD, input
 * e ciclo de vida contra um adapter falso, e depois trocar pelo core de
 * verdade sem alterar uma linha do player, do HUD ou das rotas.
 */
export const emulatorRegistry = new EmulatorRegistry();

/** Registra o adapter de um console. Útil para teste trocar por um duplo. */
export function registrarAdapter(systemId: SystemId, fabrica: EmulatorAdapterFactory): void {
  emulatorRegistry.register(systemId, fabrica, { replace: true });
}

// SNES roda no core de verdade: snes9x2010 sobre Nostalgist. Ver ADR 0011
// (runtime) e ADR 0008 (por que este core, e não o snes9x).
registrarAdapterDeSnes(emulatorRegistry, {}, { replace: true });
