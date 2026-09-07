import type { SystemId } from '@pixelvault/contracts';
import type { EmulatorAudioControl } from './audio.js';
import type { EmulatorCapabilities } from './capabilities.js';
import type { EmulatorEvent, EmulatorEventHandler, Unsubscribe } from './events.js';
import type { RomSource } from './rom-source.js';
import type { EmulatorStatus } from './status.js';

/**
 * A fronteira entre o PixelVault e qualquer runtime de emulação.
 *
 * A plataforma não depende de SNES nem de EmulatorJS: os dois são
 * implementações disto. Adicionar Mega Drive, Game Boy ou PlayStation é
 * escrever um adapter novo e registrá-lo — não mexer no player, na biblioteca
 * ou na sincronização de progresso. Ver docs/adr/0004.
 *
 * Regras que todo adapter honra:
 *
 * - **Nada de otimismo em `capabilities`.** O que não é suportado é `false`, e
 *   a operação correspondente estoura `CapabilityUnsupportedError`.
 * - **Bytes que saem são cópias.** `exportSram` e `exportState` nunca devolvem
 *   uma janela viva sobre a memória do core.
 * - **Chamada fora de ordem é `EmulatorLifecycleError`,** nunca comportamento
 *   silencioso. Depois de `destroy()`, tudo é erro.
 */
export interface EmulatorAdapter {
  readonly systemId: SystemId;
  /** Identifica o core e a versão. Entra no save state: é o que detecta incompatibilidade. */
  readonly coreVersion: string;
  readonly capabilities: EmulatorCapabilities;
  readonly status: EmulatorStatus;
  /**
   * Volume, mudo e política de autoplay. Vale em qualquer status, inclusive
   * antes de `mount()` e depois de `destroy()`: preferência do usuário não é
   * estado da máquina.
   */
  readonly audio: EmulatorAudioControl;

  /** Liga o adapter ao canvas. Sobe o core; ainda sem ROM. */
  mount(canvas: HTMLCanvasElement): Promise<void>;
  /** Carrega a ROM a partir da fonte, sem exigir que ela caiba na memória. */
  loadGame(source: RomSource): Promise<void>;
  start(): Promise<void>;
  pause(): void;
  resume(): void;
  /** Reinicia a máquina. Equivale ao botão do console, não a recarregar a ROM. */
  reset(): void;

  /** Save da bateria do cartucho. Exige `capabilities.sram`. */
  exportSram(): Promise<Uint8Array>;
  importSram(data: Uint8Array): Promise<void>;
  /** Fotografia da máquina. Exige `capabilities.saveState`. */
  exportState(): Promise<Uint8Array>;
  importState(data: Uint8Array): Promise<void>;
  /** Quadro atual como imagem — capa de save e miniatura de sessão. */
  captureFrame(): Promise<Blob>;

  on<E extends EmulatorEvent>(event: E, handler: EmulatorEventHandler<E>): Unsubscribe;
  /** Libera core, canvas e ouvintes. Idempotente. */
  destroy(): Promise<void>;
}
