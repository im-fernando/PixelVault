import type { SystemId } from '@pixelvault/contracts';
import {
  DEFAULT_AUDIO_SETTINGS,
  clampVolume,
  memoryAudioSettingsStore,
  type AudioSettingsStore,
  type EmulatorAudioControl,
} from '../adapter/audio.js';
import { defineCapabilities, type EmulatorCapabilities } from '../adapter/capabilities.js';
import { EmulatorEventEmitter } from '../adapter/emitter.js';
import type { EmulatorAdapter } from '../adapter/emulator-adapter.js';
import {
  CoreLoadError,
  EmulatorLifecycleError,
  RomInvalidError,
  StateIncompatibleError,
  requireCapability,
  type EmulatorError,
} from '../adapter/errors.js';
import type { EmulatorEvent, EmulatorEventHandler, Unsubscribe } from '../adapter/events.js';
import { describeRomSource, readRomHeader, type RomSource } from '../adapter/rom-source.js';
import { ROM_LOADED_STATUSES, type EmulatorStatus } from '../adapter/status.js';
import { deserializeFakeState, fnv1a, initialSram, serializeFakeState } from './fake-state.js';

/** Falhas injetáveis, para exercitar o caminho de erro sem quebrar o core de verdade. */
export interface FakeAdapterFailures {
  /** `mount()` estoura `CoreLoadError`. */
  readonly mount?: boolean;
  /** `loadGame()` estoura `RomInvalidError`. */
  readonly loadGame?: boolean;
  /** `importState()` estoura `StateIncompatibleError` mesmo com save state válido. */
  readonly importState?: boolean;
}

export interface FakeAdapterOptions {
  readonly systemId?: SystemId;
  readonly coreVersion?: string;
  /**
   * O que não for informado é `false`. O padrão liga `saveState` e `sram`
   * porque é o que qualquer adapter de verdade precisa ter para o player
   * fazer sentido; desligue um deles para testar a UI sem a capacidade.
   */
  readonly capabilities?: Partial<EmulatorCapabilities>;
  readonly sramBytes?: number;
  readonly failures?: FakeAdapterFailures;
  /** Onde volume e mudo ficam. Padrão: memória, que morre junto com o adapter. */
  readonly audioSettingsStore?: AudioSettingsStore;
  /**
   * Começa com o áudio bloqueado pela política de autoplay, para a UI poder
   * testar a tela de "clique para ouvir" sem um navegador de verdade.
   */
  readonly audioBlocked?: boolean;
}

const CAPACIDADES_PADRAO: Partial<EmulatorCapabilities> = { saveState: true, sram: true };
const BYTES_DE_SRAM_PADRAO = 64;
const BYTES_DE_CABECALHO = 16;
/** Um cartucho grava na bateria de tempos em tempos, não a cada quadro. */
const QUADROS_ENTRE_GRAVACOES = 60;

/**
 * Adapter que implementa o contrato inteiro sem emulador nenhum.
 *
 * Existe para que o player, a sincronização de save e a UI sejam testáveis sem
 * WASM, sem canvas de verdade e sem ROM de verdade — e para que o contrato
 * seja exercitado por uma implementação completa desde o primeiro dia, em vez
 * de ser interface que ninguém nunca implementou.
 *
 * O tempo é explícito: nada avança sozinho. Quem quiser 100 quadros chama
 * `advanceFrames(100)`. Teste que depende de `setTimeout` para o emulador
 * "andar um pouco" é teste que pisca no CI.
 */
export class FakeAdapter implements EmulatorAdapter {
  readonly systemId: SystemId;
  readonly coreVersion: string;
  readonly capabilities: EmulatorCapabilities;
  readonly audio: EmulatorAudioControl;

  readonly #emissor = new EmulatorEventEmitter();
  readonly #bytesDeSram: number;
  readonly #falhas: FakeAdapterFailures;

  readonly #preferenciasDeAudio: AudioSettingsStore;
  readonly #audio: { volume: number; muted: boolean; blocked: boolean };
  #status: EmulatorStatus = 'idle';
  #canvas: HTMLCanvasElement | null = null;
  #romId: string | null = null;
  #frame = 0;
  #sram: Uint8Array = new Uint8Array(0);

  constructor(options: FakeAdapterOptions = {}) {
    this.systemId = options.systemId ?? 'snes';
    this.coreVersion = options.coreVersion ?? 'fake-1.0.0';
    this.capabilities = defineCapabilities(options.capabilities ?? CAPACIDADES_PADRAO);
    this.#bytesDeSram = options.sramBytes ?? BYTES_DE_SRAM_PADRAO;
    this.#falhas = options.failures ?? {};

    this.#preferenciasDeAudio = options.audioSettingsStore ?? memoryAudioSettingsStore();
    const guardado = this.#preferenciasDeAudio.load() ?? DEFAULT_AUDIO_SETTINGS;
    // Um objeto só, capturado no closure: os getters de `audio` precisam ler o
    // valor de agora, e campo privado não se alcança de dentro do literal.
    const audio = {
      volume: clampVolume(guardado.volume),
      muted: guardado.muted,
      blocked: options.audioBlocked ?? false,
    };
    this.#audio = audio;
    this.audio = {
      get volume(): number {
        return audio.volume;
      },
      get muted(): boolean {
        return audio.muted;
      },
      get blocked(): boolean {
        return audio.blocked;
      },
      setVolume: (volume) => {
        audio.volume = clampVolume(volume);
        this.#guardarPreferenciaDeAudio();
      },
      setMuted: (mudo) => {
        audio.muted = mudo;
        this.#guardarPreferenciaDeAudio();
      },
      // No falso destravar sempre dá certo: quem quer o caminho da recusa
      // constrói com `audioBlocked` e simplesmente não chama `unlock`.
      unlock: () => {
        audio.blocked = false;
        this.#emitirAudio();
        return Promise.resolve(true);
      },
    };
  }

  get status(): EmulatorStatus {
    return this.#status;
  }

  /** Canvas recebido em `mount`. Só existe no falso, para o teste conferir a ligação. */
  get canvas(): HTMLCanvasElement | null {
    return this.#canvas;
  }

  /** Quadro atual. Só existe no falso: é o relógio determinístico da máquina. */
  get frameCount(): number {
    return this.#frame;
  }

  /** Identidade da ROM carregada, derivada da fonte. `null` antes de `loadGame`. */
  get romId(): string | null {
    return this.#romId;
  }

  #guardarPreferenciaDeAudio(): void {
    this.#preferenciasDeAudio.save({ volume: this.#audio.volume, muted: this.#audio.muted });
    this.#emitirAudio();
  }

  #emitirAudio(): void {
    this.#emissor.emit('audioChange', { ...this.#audio });
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this.#exigirStatus('mount', ['idle']);
    if (this.#falhas.mount === true) {
      throw new CoreLoadError(this.systemId, 'falha injetada pelo FakeAdapter');
    }
    this.#canvas = canvas;
    this.#mudarStatus('mounted');
    return Promise.resolve();
  }

  async loadGame(source: RomSource): Promise<void> {
    this.#exigirStatus('loadGame', ['mounted', ...ROM_LOADED_STATUSES]);
    this.#mudarStatus('loading');
    try {
      if (this.#falhas.loadGame === true) {
        throw new RomInvalidError('falha injetada pelo FakeAdapter');
      }
      this.#romId = await identidadeDaRom(source);
      this.#frame = 0;
      this.#sram = initialSram(this.#romId, this.#bytesDeSram);
      this.#mudarStatus('ready');
      this.#emissor.emit('ready', { systemId: this.systemId, coreVersion: this.coreVersion });
      this.#emissor.emit('sramChange', { byteLength: this.#sram.byteLength });
    } catch (erro) {
      // Carga que falhou não deixa ROM meia-carregada: volta para `mounted`,
      // que é o estado honesto de "core no ar, sem jogo".
      this.#romId = null;
      this.#sram = new Uint8Array(0);
      this.#mudarStatus('mounted');
      throw erro;
    }
  }

  async start(): Promise<void> {
    this.#exigirStatus('start', ['ready']);
    this.#mudarStatus('running');
    return Promise.resolve();
  }

  pause(): void {
    this.#exigirStatus('pause', ['running']);
    this.#mudarStatus('paused');
  }

  resume(): void {
    this.#exigirStatus('resume', ['paused']);
    this.#mudarStatus('running');
  }

  reset(): void {
    this.#exigirStatus('reset', ROM_LOADED_STATUSES);
    const romId = this.#romId ?? '';
    this.#frame = 0;
    this.#sram = initialSram(romId, this.#bytesDeSram);
    this.#emissor.emit('sramChange', { byteLength: this.#sram.byteLength });
  }

  async exportSram(): Promise<Uint8Array> {
    requireCapability(this.capabilities, 'sram');
    this.#exigirStatus('exportSram', ROM_LOADED_STATUSES);
    // Cópia: quem exporta não pode receber uma janela viva sobre a memória.
    return Promise.resolve(this.#sram.slice());
  }

  async importSram(data: Uint8Array): Promise<void> {
    requireCapability(this.capabilities, 'sram');
    this.#exigirStatus('importSram', ROM_LOADED_STATUSES);
    this.#sram = data.slice();
    this.#emissor.emit('sramChange', { byteLength: this.#sram.byteLength });
    return Promise.resolve();
  }

  async exportState(): Promise<Uint8Array> {
    requireCapability(this.capabilities, 'saveState');
    this.#exigirStatus('exportState', ROM_LOADED_STATUSES);
    return Promise.resolve(
      serializeFakeState({
        systemId: this.systemId,
        coreVersion: this.coreVersion,
        romId: this.#romId ?? '',
        frame: this.#frame,
        sram: this.#sram,
      }),
    );
  }

  async importState(data: Uint8Array): Promise<void> {
    requireCapability(this.capabilities, 'saveState');
    this.#exigirStatus('importState', ROM_LOADED_STATUSES);
    if (this.#falhas.importState === true) {
      throw new StateIncompatibleError('falha injetada pelo FakeAdapter');
    }

    const estado = deserializeFakeState(data);
    if (estado.systemId !== this.systemId) {
      throw new StateIncompatibleError(`save state de "${estado.systemId}"`);
    }
    if (estado.coreVersion !== this.coreVersion) {
      throw new StateIncompatibleError(
        `save state gravado pelo core ${estado.coreVersion}, este é ${this.coreVersion}`,
      );
    }
    if (estado.romId !== this.#romId) {
      throw new StateIncompatibleError('save state de outra ROM');
    }

    this.#frame = estado.frame;
    this.#sram = estado.sram.slice();
    this.#emissor.emit('sramChange', { byteLength: this.#sram.byteLength });
    return Promise.resolve();
  }

  /**
   * Quadro atual como SVG, e não PNG: é determinístico, é gerado sem canvas e
   * ainda assim renderiza num `<img>`, então serve para a UI de verdade.
   */
  async captureFrame(): Promise<Blob> {
    this.#exigirStatus('captureFrame', ROM_LOADED_STATUSES);
    const svg =
      '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="224" viewBox="0 0 256 224">' +
      '<rect width="256" height="224" fill="#101018"/>' +
      '<text x="128" y="112" fill="#8fdcc0" font-family="monospace" font-size="16" ' +
      `text-anchor="middle">${this.systemId} #${this.#frame}</text></svg>`;
    return Promise.resolve(new Blob([svg], { type: 'image/svg+xml' }));
  }

  on<E extends EmulatorEvent>(event: E, handler: EmulatorEventHandler<E>): Unsubscribe {
    return this.#emissor.on(event, handler);
  }

  async destroy(): Promise<void> {
    this.#mudarStatus('destroyed');
    this.#canvas = null;
    this.#romId = null;
    this.#sram = new Uint8Array(0);
    this.#emissor.removeAll();
    return Promise.resolve();
  }

  /**
   * Avança o relógio da máquina. Só existe no falso.
   *
   * A cada `QUADROS_ENTRE_GRAVACOES` o "jogo" grava um byte na SRAM, sempre o
   * mesmo para o mesmo quadro — é o que faz o save de uma partida simulada ser
   * comparável byte a byte.
   */
  advanceFrames(quadros = 1): void {
    this.#exigirStatus('advanceFrames', ['running']);
    if (quadros <= 0) {
      return;
    }

    let gravou = false;
    for (let i = 0; i < quadros; i += 1) {
      this.#frame += 1;
      if (this.#frame % QUADROS_ENTRE_GRAVACOES === 0 && this.#sram.byteLength > 0) {
        const gravacao = this.#frame / QUADROS_ENTRE_GRAVACOES;
        this.#sram[gravacao % this.#sram.byteLength] = gravacao % 256;
        gravou = true;
      }
    }

    this.#emissor.emit('fps', { fps: 60 });
    if (gravou) {
      this.#emissor.emit('sramChange', { byteLength: this.#sram.byteLength });
    }
  }

  /** Emite uma falha assíncrona. Só existe no falso, para testar a tela de erro. */
  emitError(error: EmulatorError): void {
    this.#emissor.emit('error', { error });
  }

  #exigirStatus(operacao: string, permitidos: readonly EmulatorStatus[]): void {
    if (!permitidos.includes(this.#status)) {
      throw new EmulatorLifecycleError(operacao, this.#status, permitidos);
    }
  }

  #mudarStatus(novo: EmulatorStatus): void {
    const anterior = this.#status;
    if (anterior === novo) {
      return;
    }
    this.#status = novo;
    this.#emissor.emit('statusChange', { previous: anterior, current: novo });
  }
}

/**
 * Identidade da ROM sem ler a ROM inteira.
 *
 * Em `bytes` e `blob` lê só o cabeçalho — é o que um core faz para reconhecer
 * o formato. Em `url` usa a própria URL: buscar pela rede deixaria todo teste
 * do player dependendo de servidor no ar, o que é justamente o que este
 * adapter existe para evitar.
 */
async function identidadeDaRom(source: RomSource): Promise<string> {
  const rotulo = describeRomSource(source);
  if (source.kind === 'url') {
    return `url:${fnv1a(rotulo).toString(16)}`;
  }

  const cabecalho = await readRomHeader(source, BYTES_DE_CABECALHO);
  if (cabecalho.byteLength === 0) {
    throw new RomInvalidError(`${rotulo} não tem bytes`);
  }
  let assinatura = '';
  for (const byte of cabecalho) {
    assinatura += byte.toString(16).padStart(2, '0');
  }
  return `${rotulo}:${assinatura}`;
}
