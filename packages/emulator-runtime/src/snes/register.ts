import type { EmulatorRegistry, RegisterAdapterOptions } from '../registry/registry.js';
import { SnesEmulatorAdapter, type SnesEmulatorAdapterOptions } from './snes-emulator-adapter.js';

/**
 * Registra o adapter de SNES.
 *
 * A fábrica fecha as opções no closure porque o `EmulatorRegistry` cria adapter
 * sem parâmetro nenhum de propósito: caminho de asset e configuração de core
 * variam por runtime, e colocá-los na assinatura amarraria o registry ao
 * runtime que está ganhando hoje.
 */
export function registrarAdapterDeSnes(
  registry: EmulatorRegistry,
  options: SnesEmulatorAdapterOptions = {},
  registerOptions: RegisterAdapterOptions = {},
): void {
  registry.register('snes', () => new SnesEmulatorAdapter(options), registerOptions);
}
