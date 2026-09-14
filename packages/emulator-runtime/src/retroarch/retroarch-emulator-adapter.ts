import type { SystemId } from '@pixelvault/contracts';
import { Nostalgist } from 'nostalgist';
import {
  DEFAULT_AUDIO_SETTINGS,
  browserAudioSettingsStore,
  type AudioSettingsStore,
  type EmulatorAudioControl,
} from '../adapter/audio.js';
import { type EmulatorCapabilities } from '../adapter/capabilities.js';
import { EmulatorEventEmitter } from '../adapter/emitter.js';
import type { EmulatorAdapter } from '../adapter/emulator-adapter.js';
import {
  CapabilityUnsupportedError,
  CoreLoadError,
  EmulatorLifecycleError,
  StateIncompatibleError,
  requireCapability,
} from '../adapter/errors.js';
import type { EmulatorEvent, EmulatorEventHandler, Unsubscribe } from '../adapter/events.js';
import type { RomSource } from '../adapter/rom-source.js';
import { ROM_LOADED_STATUSES, type EmulatorStatus } from '../adapter/status.js';
import { BarramentoDeAudio, houveGestoDoUsuario } from '../snes/audio-bus.js';
import {
  coletarAudioContexts,
  fecharAudioContexts,
  type ColetorDeAudioContext,
} from '../snes/audio-contexts.js';
import { BASE_PADRAO_DOS_ASSETS, type SnesCoreAssets } from '../snes/core-assets.js';
import {
  DIRETORIO_DE_SAVES,
  DIRETORIO_DE_SCREENSHOTS,
  apagarArquivo,
  esperar,
  lerArquivo,
  procurarArquivo,
  type EmscriptenDoRetroArch,
  type ModuloDoRetroArch,
  type SistemaDeArquivosDoEmscripten,
} from '../snes/retroarch.js';
import { configDeTecladoDoRetroArch } from '../snes/keyboard-bindings.js';

import { desempacotarEstado, empacotarEstado } from '../snes/state-envelope.js';

const DIRETORIO_DE_STATES = '/home/web_user/retroarch/userdata/states';

/** Um comando por quadro (ADR 0008): a 60 Hz, isto é ~1,5 s de paciência. */
const QUADROS_DE_ESPERA_POR_RESPOSTA = 90;
const PASSO_DE_ESPERA_MS = 16;
const ORCAMENTO_DE_ARQUIVO_MS = 3000;
const INTERVALO_DE_FPS_MS = 1000;
/** Quadros de folga para o RetroArch executar a tarefa de carregar save state. */
const QUADROS_ATE_O_ESTADO_ENTRAR = 4;
/**
 * O cartucho grava na bateria de tempos em tempos, e cada checagem obriga o
 * RetroArch a descarregar a SRAM no sistema de arquivos. 5 s é rápido o
 * bastante para o save automático e devagar o bastante para não custar nada.
 */
const INTERVALO_DE_VIGIA_DE_SRAM_MS = 5000;
/**
 * Quanto áudio o RetroArch mantém agendado à frente, em milissegundos.
 *
 * Medido, e não escolhido por gosto (ADR 0015). Três corridas de 120 s cada,
 * em Chrome headless, com o mesmo jogo:
 *
 * - padrão do RetroArch (64 ms): **30 buracos de silêncio, 2,44 s no total**,
 *   um deles de 962 ms;
 * - 96 ms: **zero**, nas três.
 *
 * 128 e 160 ms também zeraram, sem nenhum ganho medido a mais, e cada passo
 * custa ~15 ms de distância entre o que se vê e o que se ouve. Por isso 96.
 */
const LATENCIA_DE_AUDIO_MS = 96;

export interface RetroarchAdapterOptions {
  /** Base dos assets self-hostados. Padrão: `/emulator`. Ver a issue #17. */
  readonly assetsBaseUrl?: string;
  /**
   * Deixa o core escutar teclado no documento inteiro em vez de só no canvas.
   * Padrão `false`: uma biblioteca não sequestra o teclado da página.
   */
  readonly respondToGlobalEvents?: boolean;
  /** Sobrescreve configuração do RetroArch. Use com parcimônia. */
  readonly retroarchConfig?: Readonly<Record<string, boolean | number | string>>;
  /** Onde volume e mudo sobrevivem ao recarregar. Padrão: `localStorage`. */
  readonly audioSettingsStore?: AudioSettingsStore;
}

/** Conteúdo já validado pelo adapter do sistema. Blob evita manter CDs em um buffer JS. */
export interface ConteudoRetroarch {
  readonly fileName: string;
  readonly bytes: Uint8Array | Blob;
  readonly romId: string;
}

export interface PerfilRetroarch<Rom extends ConteudoRetroarch> {
  readonly systemId: SystemId;
  readonly assets: (base: string) => SnesCoreAssets;
  readonly capabilities: EmulatorCapabilities;
  readonly lerRom: (source: RomSource) => Promise<Rom>;
  readonly bios?: (() => Promise<{ fileName: string; fileContent: Uint8Array } | null>) | undefined;
  readonly coreConfig?: Readonly<Record<string, string>>;
  readonly detectarFalhaDeCarga?: boolean;
  readonly validarSram?: (data: Uint8Array) => void;
}

/** Ciclo de vida, áudio e persistência comuns aos cores de RetroArch. */
export class RetroarchEmulatorAdapter<Rom extends ConteudoRetroarch> implements EmulatorAdapter {
  readonly systemId: SystemId;
  readonly coreVersion: string;
  readonly capabilities: EmulatorCapabilities;
  readonly audio: EmulatorAudioControl;

  readonly #emissor = new EmulatorEventEmitter();
  readonly #assets: SnesCoreAssets;
  readonly #respondToGlobalEvents: boolean;
  readonly #retroarchConfig: Readonly<Record<string, boolean | number | string>>;

  #erroDeCarga: string | null = null;
  #status: EmulatorStatus = 'idle';
  #canvas: HTMLCanvasElement | null = null;
  #jsDoCore: Blob | null = null;
  #wasmDoCore: Blob | null = null;
  #nostalgist: Nostalgist | null = null;
  #rom: Rom | null = null;
  /** SRAM entregue por `importSram`, que é o que o core lê ao ligar. */
  #sramInicial: Uint8Array | null = null;

  #coletorDeAudio: ColetorDeAudioContext | null = null;
  readonly #barramentoDeAudio: BarramentoDeAudio;
  readonly #preferenciasDeAudio: AudioSettingsStore;
  #aoMudarVisibilidade: (() => void) | null = null;
  #aoPerderContexto: ((evento: Event) => void) | null = null;
  #amostradorDeFps: ReturnType<typeof setInterval> | null = null;
  #vigiaDeSram: ReturnType<typeof setInterval> | null = null;
  #quadroDaUltimaAmostra = 0;
  #instanteDaUltimaAmostra = 0;
  #assinaturaDaSram: string | null = null;
  /** Serializa o canal de comando: o RetroArch processa um comando por quadro. */
  #fila: Promise<unknown> = Promise.resolve();

  constructor(
    readonly perfil: PerfilRetroarch<Rom>,
    options: RetroarchAdapterOptions = {},
  ) {
    this.systemId = perfil.systemId;
    this.capabilities = perfil.capabilities;
    this.#assets = perfil.assets(options.assetsBaseUrl ?? BASE_PADRAO_DOS_ASSETS);
    this.coreVersion = `${this.#assets.nome}@${this.#assets.versao}`;
    this.#respondToGlobalEvents = options.respondToGlobalEvents ?? false;
    this.#retroarchConfig = options.retroarchConfig ?? {};
    this.#preferenciasDeAudio = options.audioSettingsStore ?? browserAudioSettingsStore();

    const barramento = new BarramentoDeAudio({
      settings: this.#preferenciasDeAudio.load() ?? DEFAULT_AUDIO_SETTINGS,
      aoMudar: (estado) => {
        this.#emissor.emit('audioChange', estado);
      },
    });
    this.#barramentoDeAudio = barramento;
    this.audio = {
      get volume(): number {
        return barramento.volume;
      },
      get muted(): boolean {
        return barramento.muted;
      },
      get blocked(): boolean {
        return barramento.blocked;
      },
      setVolume: (volume) => {
        barramento.setVolume(volume);
        this.#guardarPreferenciaDeAudio();
      },
      setMuted: (mudo) => {
        barramento.setMuted(mudo);
        this.#guardarPreferenciaDeAudio();
      },
      unlock: () => barramento.unlock(),
    };
  }

  get status(): EmulatorStatus {
    return this.#status;
  }

  protected get conteudo(): Rom | null {
    return this.#rom;
  }

  async mount(canvas: HTMLCanvasElement): Promise<void> {
    this.#exigirStatus('mount', ['idle']);
    this.#mudarStatus('loading');
    try {
      const [js, wasm] = await Promise.all([
        this.#baixar(this.#assets.urlDoJs),
        this.#baixar(this.#assets.urlDoWasm),
      ]);
      this.#jsDoCore = js;
      this.#wasmDoCore = wasm;
      this.#canvas = canvas;
      this.#ouvirPerdaDeContexto(canvas);
      this.#ouvirVisibilidade();
      this.#mudarStatus('mounted');
    } catch (erro) {
      this.#mudarStatus('idle');
      throw erro instanceof CoreLoadError
        ? erro
        : new CoreLoadError(this.systemId, 'não consegui preparar os assets do core', {
            cause: erro,
          });
    }
  }

  async loadGame(source: RomSource): Promise<void> {
    this.#exigirStatus('loadGame', ['mounted', ...ROM_LOADED_STATUSES]);
    this.#mudarStatus('loading');
    try {
      const rom = await this.perfil.lerRom(source);
      await this.#derrubarMaquina();
      this.#rom = rom;
      this.#sramInicial = null;
      this.#assinaturaDaSram = null;
      this.#nostalgist = await this.#prepararMaquina(rom, null);
      this.#mudarStatus('ready');
      this.#emissor.emit('ready', { systemId: this.systemId, coreVersion: this.coreVersion });
    } catch (erro) {
      // Carga que falhou não deixa ROM meia-carregada: volta para `mounted`,
      // que é o estado honesto de "core baixado, sem jogo".
      this.#rom = null;
      this.#nostalgist = null;
      this.#mudarStatus('mounted');
      throw erro;
    }
  }

  async start(): Promise<void> {
    this.#exigirStatus('start', ['ready']);
    this.#barramentoDeAudio.permitir('pausa');
    await this.#exigirNostalgist().start();
    await this.#conferirCarga();
    this.#mudarStatus('running');
    this.#iniciarMedidores();
  }

  pause(): void {
    this.#exigirStatus('pause', ['running']);
    // O silêncio vai antes: o RetroArch já deixou até ~45 ms de áudio agendado
    // no futuro, e parar o core não desagenda nada. Sem a rampa, esse rabo
    // continua tocando depois da pausa e termina num corte seco.
    this.#barramentoDeAudio.silenciar('pausa');
    this.#exigirNostalgist().pause();
    this.#pararMedidores();
    this.#mudarStatus('paused');
  }

  resume(): void {
    this.#exigirStatus('resume', ['paused']);
    this.#exigirNostalgist().resume();
    this.#barramentoDeAudio.permitir('pausa');
    this.#mudarStatus('running');
    this.#iniciarMedidores();
  }

  /**
   * Botão de reset do console: a máquina reinicia, a bateria continua onde
   * estava. Recarregar a ROM é `loadGame` de novo.
   */
  reset(): void {
    this.#exigirStatus('reset', ROM_LOADED_STATUSES);
    // `nostalgist.restart()` manda RESET e depois `resume()`, o que tiraria da
    // pausa quem estava pausado. Aqui o comando vai cru e o status é nosso.
    this.#exigirNostalgist().sendCommand('RESET');
  }

  /**
   * Bateria do cartucho, em bytes.
   *
   * Em `ready` devolve o que foi entregue por `importSram` — a máquina ainda
   * não rodou, então não há nada novo para descarregar. Jogo sem bateria
   * devolve zero bytes, e não um erro: "este cartucho não salva" é uma resposta,
   * não uma falha.
   */
  async exportSram(): Promise<Uint8Array> {
    requireCapability(this.capabilities, 'sram');
    this.#exigirStatus('exportSram', ROM_LOADED_STATUSES);
    if (this.#status === 'ready') {
      return this.#sramInicial?.slice() ?? new Uint8Array(0);
    }
    return this.#enfileirar(() => this.#descarregarSram());
  }

  /**
   * Entrega a bateria e **reinicia a máquina com ela**.
   *
   * O cartucho lê a bateria ao ligar; o RetroArch carrega o `.srm` junto com o
   * conteúdo. Não há como trocar a bateria com o jogo no ar sem mentir sobre o
   * que o console faz. O estado de execução (rodando ou pausado) é preservado.
   */
  async importSram(data: Uint8Array): Promise<void> {
    requireCapability(this.capabilities, 'sram');
    this.#exigirStatus('importSram', ROM_LOADED_STATUSES);
    const rom = this.#exigirRom();
    const statusAnterior = this.#status;
    this.perfil.validarSram?.(data);

    this.#sramInicial = data.slice();
    this.#assinaturaDaSram = null;
    this.#pararMedidores();
    await this.#derrubarMaquina();

    this.#nostalgist = await this.#prepararMaquina(rom, this.#sramInicial);
    if (statusAnterior !== 'ready') {
      await this.#nostalgist.start();
      await this.#conferirCarga();
      if (statusAnterior === 'paused') {
        this.#nostalgist.pause();
      } else {
        this.#iniciarMedidores();
      }
    }
    this.#emissor.emit('sramChange', { byteLength: this.#sramInicial.byteLength });
  }

  /**
   * Fotografia da máquina, embrulhada no envelope que carrega `coreVersion`.
   *
   * Exige a máquina rodando ou pausada: o RetroArch só serializa depois que o
   * `main` dele rodou. Ver `state-envelope.ts` para o porquê do envelope.
   */
  async exportState(): Promise<Uint8Array> {
    requireCapability(this.capabilities, 'saveState');
    this.#exigirStatus('exportState', ['running', 'paused']);
    const rom = this.#exigirRom();
    const bruto = await this.#enfileirar(() => this.#gravarEstado());
    return empacotarEstado({
      systemId: this.systemId,
      coreVersion: this.coreVersion,
      romId: rom.romId,
      estado: bruto,
    });
  }

  async importState(data: Uint8Array): Promise<void> {
    requireCapability(this.capabilities, 'saveState');
    this.#exigirStatus('importState', ['running', 'paused']);
    const rom = this.#exigirRom();
    const envelope = desempacotarEstado(data);

    if (envelope.systemId !== this.systemId) {
      throw new StateIncompatibleError(`save state de "${envelope.systemId}"`);
    }
    if (envelope.coreVersion !== this.coreVersion) {
      throw new StateIncompatibleError(
        `save state gravado pelo core ${envelope.coreVersion}, este é ${this.coreVersion}`,
      );
    }
    if (envelope.romId !== rom.romId) {
      throw new StateIncompatibleError('save state de outra ROM');
    }

    const nostalgist = this.#exigirNostalgist();
    await this.#enfileirar(async () => {
      // O Nostalgist aceita `Uint8Array` direto; não há motivo para embrulhar.
      await nostalgist.loadState(envelope.estado);
      // `LOAD_STATE` enfileira uma tarefa que o RetroArch executa no laço
      // principal. Sem esperar o laço girar, `importState` resolveria antes de
      // a máquina ter mudado — e quem lesse a memória logo depois leria o
      // estado antigo. Medido: sem esta espera, o teste no navegador não volta
      // ao ponto salvo.
      await this.#esperarQuadros(QUADROS_ATE_O_ESTADO_ENTRAR);
    });
  }

  /** Quadro atual em PNG, pelo próprio RetroArch — é o que está na tela, não o canvas. */
  async captureFrame(): Promise<Blob> {
    this.#exigirStatus('captureFrame', ['running', 'paused']);
    const bytes = await this.#enfileirar(() => this.#tirarScreenshot());
    return comoBlob(bytes, 'image/png');
  }

  /**
   * Lê a memória do console. **Não faz parte do `EmulatorAdapter`.**
   *
   * Existe para que `capabilities.memoryRead: true` seja verdade e não promessa:
   * é o canal sobre o qual a M6 constrói conquista por evento de jogo (ADR
   * 0008). O RetroArch processa um comando por quadro, então as leituras são
   * enfileiradas — `setInterval` mais rápido que 60 Hz enche uma fila que
   * cresce sem limite.
   */
  async readMemory(endereco: number, byteLength: number): Promise<Uint8Array> {
    requireCapability(this.capabilities, 'memoryRead');
    this.#exigirStatus('readMemory', ['running', 'paused']);
    return this.#enfileirar(() => this.#lerMemoria(endereco, byteLength));
  }

  on<E extends EmulatorEvent>(event: E, handler: EmulatorEventHandler<E>): Unsubscribe {
    return this.#emissor.on(event, handler);
  }

  async destroy(): Promise<void> {
    if (this.#status === 'destroyed') {
      return;
    }
    this.#pararMedidores();
    await this.#derrubarMaquina();
    this.#pararDeOuvirPerdaDeContexto();
    this.#pararDeOuvirVisibilidade();

    this.#canvas = null;
    this.#rom = null;
    this.#sramInicial = null;
    this.#jsDoCore = null;
    this.#wasmDoCore = null;
    this.#assinaturaDaSram = null;

    this.#mudarStatus('destroyed');
    this.#emissor.removeAll();
  }

  // -- máquina ---------------------------------------------------------------

  async #prepararMaquina(rom: Rom, sram: Uint8Array | null): Promise<Nostalgist> {
    const js = this.#jsDoCore;
    const wasm = this.#wasmDoCore;
    const canvas = this.#canvas;
    if (js === null || wasm === null || canvas === null) {
      throw new CoreLoadError(this.systemId, 'o adapter não está montado');
    }

    // O coletor entra antes do `prepare` e só sai no `destroy`: o RetroArch
    // abre o `AudioContext` durante o boot do conteúdo, e a única alça que
    // sobra para fechá-lo — e para pendurar o volume nele — é o construtor.
    // Ver `audio-contexts.ts` e `audio-bus.ts`.
    this.#coletorDeAudio ??= coletarAudioContexts({
      aoCriar: (contexto) => {
        this.#barramentoDeAudio.instalar(contexto);
      },
      podeRetomar: houveGestoDoUsuario,
    });

    this.#erroDeCarga = null;
    try {
      const bios = await this.perfil.bios?.();
      // Nostalgist encaminha overrides Emscripten, mas sua tipagem omite printErr.
      const modulo: NonNullable<Parameters<typeof Nostalgist.prepare>[0]['emscriptenModule']> & {
        printErr: (...args: unknown[]) => void;
      } = {
        printErr: (...args) => {
          const mensagem = args.map(String).join(' ');
          if (
            /Failed to load content|unsupported\/invalid CD image|Could not load BIOS/i.test(
              mensagem,
            )
          )
            this.#erroDeCarga =
              'O core não conseguiu abrir este disco. Confira o formato, a integridade da imagem e a BIOS selecionada.';
          console.error(...args);
        },
      };
      return await Nostalgist.prepare({
        ...(this.perfil.detectarFalhaDeCarga ? { emscriptenModule: modulo } : {}),
        ...(bios ? { bios } : {}),
        ...(this.perfil.coreConfig ? { retroarchCoreConfig: this.perfil.coreConfig } : {}),
        core: { name: this.#assets.nome, js, wasm },
        rom: { fileName: rom.fileName, fileContent: rom.bytes },
        element: canvas,
        size: 'auto',
        respondToGlobalEvents: this.#respondToGlobalEvents,
        retroarchConfig: {
          // Miniatura de save state é trabalho e bytes que não usamos:
          // `captureFrame` já dá a imagem, quando alguém pedir.
          savestate_thumbnail_enable: false,
          // Áudio (ADR 0015). Os três primeiros já são o padrão do RetroArch e
          // estão fixados aqui **por serem o que faz o áudio funcionar**: é o
          // reamostrador que casa os 32.040 Hz do SNES com o `AudioContext`, e
          // é o controle de taxa que mantém a fila cheia sem acumular atraso.
          // Se um deles mudar de padrão numa atualização de core, a regressão é
          // silenciosa e só aparece como estalo.
          audio_sync: true,
          audio_rate_control: true,
          audio_resampler: 'sinc',
          audio_latency: LATENCIA_DE_AUDIO_MS,
          // Teclado (ADR 0023, issue #36): manda `input_player1_*` a partir do
          // mesmo mapa que a legenda da UI desenha, em vez de deixar o core
          // escutar o DOM com o keymap padrão dele por conta própria. É o que
          // faz a legenda parar de poder mentir, e o que a M7 usa para remapear
          // — gerar este objeto a partir de um mapa diferente.
          ...configDeTecladoDoRetroArch(),
          ...this.#retroarchConfig,
        },
        ...(sram === null ? {} : { sram }),
      });
    } catch (erro) {
      throw new CoreLoadError(this.systemId, 'o core não subiu com esta ROM', { cause: erro });
    }
  }

  async #conferirCarga(): Promise<void> {
    if (!this.#erroDeCarga) return;
    const erro = this.#erroDeCarga;
    await this.#derrubarMaquina();
    this.#mudarStatus('mounted');
    throw new CoreLoadError(this.systemId, erro);
  }

  async #derrubarMaquina(): Promise<void> {
    const nostalgist = this.#nostalgist;
    this.#nostalgist = null;
    this.#barramentoDeAudio.desinstalar();
    if (nostalgist !== null) {
      try {
        // `removeCanvas: false`: o canvas é de quem chamou `mount`, e arrancá-lo
        // do DOM quebraria o player que o desenhou.
        nostalgist.exit({ removeCanvas: false });
      } catch {
        // Sair de um core que já morreu não é motivo para impedir a limpeza.
      }
    }

    const coletor = this.#coletorDeAudio;
    this.#coletorDeAudio = null;
    if (coletor !== null) {
      coletor.parar();
      await fecharAudioContexts(coletor.contextos);
    }
  }

  async #baixar(url: string): Promise<Blob> {
    let resposta: Response;
    try {
      resposta = await fetch(url);
    } catch (erro) {
      throw new CoreLoadError(this.systemId, `não consegui buscar ${url}`, { cause: erro });
    }
    if (!resposta.ok) {
      throw new CoreLoadError(this.systemId, `HTTP ${resposta.status} em ${url}`);
    }
    return resposta.blob();
  }

  // -- SRAM, save state e imagem ---------------------------------------------

  /**
   * Descarrega a SRAM e a lê do sistema de arquivos do Emscripten.
   *
   * Não usa `nostalgist.saveSRAM()` de propósito: aquele método espera o
   * arquivo aparecer com um orçamento de 120 tentativas, e num jogo **sem**
   * bateria o arquivo nunca aparece — medido, ele trava por **59 segundos** e
   * então estoura `fs timeout`. Metade do catálogo público não salva.
   */
  async #descarregarSram(): Promise<Uint8Array> {
    const modulo = this.#modulo();
    if (typeof modulo._cmd_savefiles !== 'function') {
      throw new CoreLoadError(
        this.systemId,
        'este build do RetroArch não exporta `_cmd_savefiles`',
      );
    }
    modulo._cmd_savefiles();
    const bytes = await this.#esperarArquivo(DIRETORIO_DE_SAVES, ['.srm', '.sav'], 800);
    return bytes?.slice() ?? new Uint8Array(0);
  }

  async #gravarEstado(): Promise<Uint8Array> {
    const fs = this.#fs();
    this.#limparEstados(fs);
    this.#exigirNostalgist().sendCommand('SAVE_STATE');
    const bytes = await this.#esperarArquivo(
      DIRETORIO_DE_STATES,
      ['.state'],
      ORCAMENTO_DE_ARQUIVO_MS,
    );
    if (bytes === null) {
      throw new CoreLoadError(
        this.systemId,
        `o core não gravou o save state em ${ORCAMENTO_DE_ARQUIVO_MS} ms`,
      );
    }
    const copia = bytes.slice();
    this.#limparEstados(fs);
    return copia;
  }

  async #tirarScreenshot(): Promise<Uint8Array> {
    const fs = this.#fs();
    const anterior = procurarArquivo(fs, DIRETORIO_DE_SCREENSHOTS, '.png');
    if (anterior !== null) {
      apagarArquivo(fs, anterior);
    }
    this.#exigirNostalgist().sendCommand('SCREENSHOT');
    const bytes = await this.#esperarArquivo(
      DIRETORIO_DE_SCREENSHOTS,
      ['.png'],
      ORCAMENTO_DE_ARQUIVO_MS,
    );
    if (bytes === null) {
      throw new CoreLoadError(
        this.systemId,
        `o core não gravou a imagem em ${ORCAMENTO_DE_ARQUIVO_MS} ms`,
      );
    }
    const copia = bytes.slice();
    const caminho = procurarArquivo(fs, DIRETORIO_DE_SCREENSHOTS, '.png');
    if (caminho !== null) {
      apagarArquivo(fs, caminho);
    }
    return copia;
  }

  /**
   * Espera um arquivo aparecer e **parar de crescer**, com orçamento.
   *
   * O tamanho estável é o que distingue "o RetroArch terminou de escrever" de
   * "peguei o arquivo pela metade". O orçamento é o que distingue "este jogo
   * não salva" de "travei a aba".
   */
  async #esperarArquivo(
    raiz: string,
    sufixos: readonly string[],
    orcamentoMs: number,
  ): Promise<Uint8Array | null> {
    const fs = this.#fs();
    const limite = Date.now() + orcamentoMs;
    let tamanhoAnterior = -1;

    while (Date.now() < limite) {
      const caminho = sufixos
        .map((sufixo) => procurarArquivo(fs, raiz, sufixo))
        .find((achado) => achado !== null);
      if (caminho !== undefined && caminho !== null) {
        const bytes = lerArquivo(fs, caminho);
        if (bytes !== null && bytes.byteLength > 0) {
          if (bytes.byteLength === tamanhoAnterior) {
            return bytes;
          }
          tamanhoAnterior = bytes.byteLength;
        }
      }
      await esperar(PASSO_DE_ESPERA_MS);
    }
    return null;
  }

  #limparEstados(fs: SistemaDeArquivosDoEmscripten): void {
    for (const sufixo of ['.state', '.state.png', '.state.auto']) {
      const caminho = procurarArquivo(fs, DIRETORIO_DE_STATES, sufixo);
      if (caminho !== null) {
        apagarArquivo(fs, caminho);
      }
    }
  }

  // -- canal de comando ------------------------------------------------------

  async #lerMemoria(endereco: number, byteLength: number): Promise<Uint8Array> {
    const modulo = this.#modulo();
    const enviar = modulo.EmscriptenSendCommand;
    const receber = modulo.EmscriptenReceiveCommandReply;
    if (typeof enviar !== 'function' || typeof receber !== 'function') {
      throw new CapabilityUnsupportedError('memoryRead');
    }

    enviar(`READ_CORE_MEMORY ${endereco.toString(16)} ${byteLength}`);
    for (let tentativa = 0; tentativa < QUADROS_DE_ESPERA_POR_RESPOSTA; tentativa += 1) {
      const resposta = receber();
      if (typeof resposta === 'string' && resposta.length > 0) {
        return interpretarLeitura(resposta, this.systemId);
      }
      await esperar(PASSO_DE_ESPERA_MS);
    }
    throw new CoreLoadError(this.systemId, 'o core não respondeu a READ_CORE_MEMORY');
  }

  /**
   * Uma operação de cada vez sobre o canal do RetroArch.
   *
   * Save state, screenshot e leitura de memória disputam a mesma fila de um
   * comando por quadro (ADR 0008). Mandar dois ao mesmo tempo faz um ler a
   * resposta do outro.
   */
  #enfileirar<T>(operacao: () => Promise<T>): Promise<T> {
    const proxima = this.#fila.then(operacao);
    this.#fila = proxima.catch(() => undefined);
    return proxima;
  }

  // -- medidores -------------------------------------------------------------

  #iniciarMedidores(): void {
    this.#quadroDaUltimaAmostra = this.#quadroAtual();
    this.#instanteDaUltimaAmostra = Date.now();
    this.#amostradorDeFps ??= setInterval(() => {
      this.#amostrarFps();
    }, INTERVALO_DE_FPS_MS);
    this.#vigiaDeSram ??= setInterval(() => {
      void this.#amostrarSram();
    }, INTERVALO_DE_VIGIA_DE_SRAM_MS);
  }

  #pararMedidores(): void {
    if (this.#amostradorDeFps !== null) {
      clearInterval(this.#amostradorDeFps);
      this.#amostradorDeFps = null;
    }
    if (this.#vigiaDeSram !== null) {
      clearInterval(this.#vigiaDeSram);
      this.#vigiaDeSram = null;
    }
  }

  /**
   * FPS a partir de `Browser.mainLoop.currentFrameNumber`, o contador de
   * iterações do laço do Emscripten. Uma iteração é um quadro emulado — é a
   * medida do emulador, e não a taxa de atualização da tela.
   */
  #amostrarFps(): void {
    const quadro = this.#quadroAtual();
    const agora = Date.now();
    const decorrido = agora - this.#instanteDaUltimaAmostra;
    if (quadro <= 0 || decorrido <= 0) {
      return;
    }
    const fps = ((quadro - this.#quadroDaUltimaAmostra) * 1000) / decorrido;
    this.#quadroDaUltimaAmostra = quadro;
    this.#instanteDaUltimaAmostra = agora;
    if (Number.isFinite(fps) && fps >= 0) {
      this.#emissor.emit('fps', { fps: Math.round(fps * 100) / 100 });
    }
  }

  /**
   * `sramChange` sem apoio do core.
   *
   * O libretro não avisa quando o jogo escreve na bateria, então a única forma
   * honesta é descarregar e comparar. A comparação é por FNV-1a dos bytes: 8 KB
   * a cada 5 segundos não aparece em medição nenhuma.
   */
  async #amostrarSram(): Promise<void> {
    if (this.#status !== 'running' || this.#nostalgist === null) {
      return;
    }
    try {
      const bytes = await this.#enfileirar(() => this.#descarregarSram());
      const assinatura = `${bytes.byteLength}:${fnv1a(bytes)}`;
      if (assinatura === this.#assinaturaDaSram) {
        return;
      }
      this.#assinaturaDaSram = assinatura;
      if (bytes.byteLength > 0) {
        this.#emissor.emit('sramChange', { byteLength: bytes.byteLength });
      }
    } catch (erro) {
      this.#emissor.emit('error', {
        error:
          erro instanceof CoreLoadError
            ? erro
            : new CoreLoadError(this.systemId, 'falha ao acompanhar a SRAM', { cause: erro }),
      });
    }
  }

  /**
   * Espera o laço principal do Emscripten girar `quantidade` vezes.
   *
   * O laço continua girando com a emulação pausada — quem para é o core, não o
   * `requestAnimationFrame` do RetroArch —, então isto funciona nos dois casos.
   */
  async #esperarQuadros(quantidade: number): Promise<void> {
    const alvo = this.#quadroAtual() + quantidade;
    const limite = Date.now() + ORCAMENTO_DE_ARQUIVO_MS;
    while (this.#quadroAtual() < alvo && Date.now() < limite) {
      await esperar(PASSO_DE_ESPERA_MS);
    }
  }

  #quadroAtual(): number {
    const nostalgist = this.#nostalgist;
    if (nostalgist === null) {
      return 0;
    }
    try {
      const emscripten = nostalgist.getEmscripten() as EmscriptenDoRetroArch;
      return emscripten.Browser?.mainLoop?.currentFrameNumber ?? 0;
    } catch {
      return 0;
    }
  }

  // -- infraestrutura --------------------------------------------------------

  /**
   * Perda de contexto WebGL é a falha assíncrona clássica: a aba ficou em
   * segundo plano, o driver recolheu a GPU, e o jogo não volta sozinho.
   */
  #ouvirPerdaDeContexto(canvas: HTMLCanvasElement): void {
    const ouvinte = (evento: Event): void => {
      evento.preventDefault();
      this.#emissor.emit('error', {
        error: new CoreLoadError(this.systemId, 'o navegador perdeu o contexto WebGL do canvas'),
      });
    };
    this.#aoPerderContexto = ouvinte;
    canvas.addEventListener('webglcontextlost', ouvinte);
  }

  /**
   * Aba invisível não faz barulho.
   *
   * O `requestAnimationFrame` do RetroArch é estrangulado quando a aba some, o
   * que **quase** para o áudio sozinho — mas "quase" aqui é o rabo que já está
   * agendado, e depende do humor do navegador. A rampa de ganho é imediata e
   * não depende de ninguém.
   *
   * O que este ouvinte deliberadamente **não** faz é suspender o
   * `AudioContext`, porque suspender não cala: medido, o contexto volta a
   * `running` em menos de 50 ms, já que o `RWebAudio` chama `resume()` a cada
   * buffer. Ver ADR 0015.
   */
  #ouvirVisibilidade(): void {
    if (this.#aoMudarVisibilidade !== null || typeof document === 'undefined') {
      return;
    }
    const ouvinte = (): void => {
      if (document.visibilityState === 'hidden') {
        this.#barramentoDeAudio.silenciar('aba-oculta');
      } else {
        this.#barramentoDeAudio.permitir('aba-oculta');
      }
    };
    this.#aoMudarVisibilidade = ouvinte;
    document.addEventListener('visibilitychange', ouvinte);
    ouvinte();
  }

  #pararDeOuvirVisibilidade(): void {
    const ouvinte = this.#aoMudarVisibilidade;
    if (ouvinte !== null && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', ouvinte);
    }
    this.#aoMudarVisibilidade = null;
  }

  #guardarPreferenciaDeAudio(): void {
    this.#preferenciasDeAudio.save({
      volume: this.#barramentoDeAudio.volume,
      muted: this.#barramentoDeAudio.muted,
    });
  }

  #pararDeOuvirPerdaDeContexto(): void {
    const ouvinte = this.#aoPerderContexto;
    if (ouvinte !== null && this.#canvas !== null) {
      this.#canvas.removeEventListener('webglcontextlost', ouvinte);
    }
    this.#aoPerderContexto = null;
  }

  #modulo(): ModuloDoRetroArch {
    return this.#exigirNostalgist().getEmscriptenModule() as ModuloDoRetroArch;
  }

  #fs(): SistemaDeArquivosDoEmscripten {
    return this.#exigirNostalgist().getEmscriptenFS() as SistemaDeArquivosDoEmscripten;
  }

  #exigirNostalgist(): Nostalgist {
    if (this.#nostalgist === null) {
      throw new EmulatorLifecycleError('operação', this.#status, ROM_LOADED_STATUSES);
    }
    return this.#nostalgist;
  }

  #exigirRom(): Rom {
    if (this.#rom === null) {
      throw new EmulatorLifecycleError('operação', this.#status, ROM_LOADED_STATUSES);
    }
    return this.#rom;
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
 * `READ_CORE_MEMORY 7e0000 09 5F 00 ...`, ou
 * `READ_CORE_MEMORY 7e0000 -1 no memory map defined` quando o core não declara
 * memory maps — que é exatamente o que reprovou o `snes9x`. Ver ADR 0008.
 */
export function interpretarLeitura(resposta: string, systemId: SystemId = 'snes'): Uint8Array {
  const partes = resposta.trim().split(/\s+/);
  const valores = partes.slice(2);
  if (valores.length === 0 || valores[0] === '-1') {
    throw new CapabilityUnsupportedError('memoryRead');
  }
  const bytes = new Uint8Array(valores.length);
  for (let i = 0; i < valores.length; i += 1) {
    const valor = Number.parseInt(valores[i] ?? '', 16);
    if (Number.isNaN(valor)) {
      throw new CoreLoadError(systemId, `resposta ilegível de READ_CORE_MEMORY: "${resposta}"`);
    }
    bytes[i] = valor;
  }
  return bytes;
}

/**
 * `Uint8Array` do lib padrão é sobre `ArrayBufferLike`, e `BlobPart` exige
 * `ArrayBuffer`. Copiar para um buffer próprio resolve sem `as`, e o custo de
 * copiar uma imagem de alguns KB não aparece em medição nenhuma.
 */
function comoBlob(bytes: Uint8Array, tipo: string): Blob {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return new Blob([buffer], { type: tipo });
}

function fnv1a(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash >>> 0).toString(16);
}
