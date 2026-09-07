import { clampVolume, type AudioSettings } from '../adapter/audio.js';

/**
 * Um `GainNode` entre o RetroArch e a saída de som.
 *
 * **Por que isto existe e por que não é um `AudioWorklet`.** O driver de áudio
 * do RetroArch em WASM é o `RWebAudio`: a cada ~10 ms ele monta um
 * `AudioBuffer`, cria um `AudioBufferSourceNode` e o agenda em
 * `context.destination` no instante em que o anterior termina. Não é
 * `ScriptProcessorNode` — não há nada de depreciado a substituir — e a fila é
 * realimentada pelo controle de taxa do próprio RetroArch, que é o que mantém
 * áudio e vídeo em sincronia. Ver ADR 0015.
 *
 * O que faltava não era a saída, era **um lugar para mexer no volume**: o
 * `RWebAudio` liga cada fonte direto no `destination`, e `destination` não tem
 * ganho. A única alça é a leitura de `context.destination`, que ele faz a cada
 * buffer. Sombrear essa propriedade na instância põe o ganho no meio do
 * caminho sem tocar em uma linha do RetroArch.
 *
 * Com o ganho no lugar, três defeitos medidos deixam de existir: o rabo de
 * ~45 ms de áudio que continuava tocando depois do `pause()`, o estalo de
 * entrada quando o `resume()` recomeça no meio da onda, e som de aba
 * invisível.
 */

/** O que a UI precisa saber. */
export interface EstadoDoAudio {
  readonly volume: number;
  readonly muted: boolean;
  readonly blocked: boolean;
}

/** Por que o barramento está calado. Vários podem valer ao mesmo tempo. */
export type MotivoDeSilencio = 'pausa' | 'aba-oculta';

export interface OpcoesDoBarramentoDeAudio {
  readonly settings: AudioSettings;
  readonly aoMudar?: (estado: EstadoDoAudio) => void;
}

/**
 * Rampas curtas o bastante para não serem ouvidas como fade e longas o
 * bastante para não serem ouvidas como estalo. Um degrau instantâneo no ganho
 * é uma descontinuidade — exatamente o que esta issue existe para eliminar.
 */
const RAMPA_DE_VOLUME_S = 0.02;
/**
 * Cair mais rápido do que a fila do RetroArch: o driver agenda até ~45 ms de
 * áudio à frente, e o silêncio precisa alcançar o que já está agendado.
 */
const RAMPA_DE_SILENCIO_S = 0.02;
/**
 * Subir mais devagar do que cai. Ao voltar da pausa o RetroArch deixa uma
 * lacuna medida de ~11 ms antes de o som recomeçar; sob uma rampa de subida
 * essa lacuna fica embaixo de um ganho quase zero, em vez de virar um degrau.
 */
const RAMPA_DE_VOLTA_S = 0.04;

export class BarramentoDeAudio {
  #volume: number;
  #mudo: boolean;
  readonly #aoMudar: (estado: EstadoDoAudio) => void;
  readonly #silencios = new Set<MotivoDeSilencio>();

  #contexto: AudioContext | null = null;
  #ganho: GainNode | null = null;
  #aoMudarEstadoDoContexto: (() => void) | null = null;
  #ouvintesDeGesto: Array<() => void> = [];

  constructor(options: OpcoesDoBarramentoDeAudio) {
    this.#volume = clampVolume(options.settings.volume);
    this.#mudo = options.settings.muted;
    this.#aoMudar = options.aoMudar ?? (() => undefined);
  }

  get volume(): number {
    return this.#volume;
  }

  get muted(): boolean {
    return this.#mudo;
  }

  /** Sem contexto ainda não há nada bloqueado: não há som para bloquear. */
  get blocked(): boolean {
    const contexto = this.#contexto;
    return contexto !== null && contexto.state === 'suspended';
  }

  get estado(): EstadoDoAudio {
    return { volume: this.#volume, muted: this.#mudo, blocked: this.blocked };
  }

  /** Ganho que chega ao `GainNode`. Existe para a verificação poder afirmar algo. */
  get ganhoAlvo(): number {
    if (this.#mudo || this.#silencios.size > 0) {
      return 0;
    }
    // Quadrática: o ouvido é aproximadamente logarítmico, e um slider ligado
    // direto na amplitude parece que só faz efeito no último quarto do curso.
    return this.#volume * this.#volume;
  }

  /**
   * Põe o ganho entre o `RWebAudio` e a saída.
   *
   * Chamado pelo coletor de `AudioContext` no instante em que o RetroArch
   * constrói o dele — é o único momento em que temos a instância na mão antes
   * de o primeiro buffer ser agendado.
   */
  instalar(contexto: AudioContext): void {
    if (this.#contexto !== null) {
      this.desinstalar();
    }
    let ganho: GainNode;
    let saidaReal: AudioNode;
    try {
      saidaReal = contexto.destination;
      ganho = contexto.createGain();
      ganho.connect(saidaReal);
      Object.defineProperty(contexto, 'destination', {
        value: ganho,
        configurable: true,
        enumerable: false,
      });
    } catch {
      // Ambiente sem WebAudio de verdade (um teste, um navegador exótico) não
      // pode impedir o emulador de rodar. Sem barramento, sem volume — e o
      // áudio continua saindo como o RetroArch o produz.
      return;
    }

    this.#contexto = contexto;
    this.#ganho = ganho;
    ganho.gain.value = this.ganhoAlvo;

    const aoMudarEstado = (): void => {
      this.#aoMudar(this.estado);
    };
    this.#aoMudarEstadoDoContexto = aoMudarEstado;
    contexto.addEventListener('statechange', aoMudarEstado);

    if (contexto.state === 'suspended') {
      this.#armarGesto();
    }
    this.#aoMudar(this.estado);
  }

  desinstalar(): void {
    const contexto = this.#contexto;
    if (contexto === null) {
      return;
    }
    if (this.#aoMudarEstadoDoContexto !== null) {
      contexto.removeEventListener('statechange', this.#aoMudarEstadoDoContexto);
    }
    this.#desarmarGesto();
    this.#aoMudarEstadoDoContexto = null;
    this.#contexto = null;
    this.#ganho = null;
    // Sem contexto não há bloqueio de autoplay: quem estava mostrando "clique
    // para ouvir" precisa saber que aquela tela não vale mais.
    this.#aoMudar(this.estado);
  }

  setVolume(volume: number): void {
    const novo = clampVolume(volume);
    if (novo === this.#volume) {
      return;
    }
    this.#volume = novo;
    this.#aplicar(RAMPA_DE_VOLUME_S);
    this.#aoMudar(this.estado);
  }

  setMuted(mudo: boolean): void {
    if (mudo === this.#mudo) {
      return;
    }
    this.#mudo = mudo;
    this.#aplicar(mudo ? RAMPA_DE_SILENCIO_S : RAMPA_DE_VOLTA_S);
    this.#aoMudar(this.estado);
  }

  silenciar(motivo: MotivoDeSilencio): void {
    if (this.#silencios.has(motivo)) {
      return;
    }
    this.#silencios.add(motivo);
    this.#aplicar(RAMPA_DE_SILENCIO_S);
  }

  permitir(motivo: MotivoDeSilencio): void {
    if (!this.#silencios.delete(motivo)) {
      return;
    }
    this.#aplicar(RAMPA_DE_VOLTA_S);
  }

  /** Chamar de dentro de um gesto do usuário. Ver `EmulatorAudioControl.unlock`. */
  async unlock(): Promise<boolean> {
    const contexto = this.#contexto;
    if (contexto === null) {
      return false;
    }
    try {
      await contexto.resume();
    } catch {
      // Recusa do navegador é resposta, não exceção para quem chamou.
    }
    const destravado = contexto.state === 'running';
    if (destravado) {
      this.#desarmarGesto();
    }
    this.#aoMudar(this.estado);
    return destravado;
  }

  #aplicar(rampaS: number): void {
    const ganho = this.#ganho;
    const contexto = this.#contexto;
    if (ganho === null || contexto === null) {
      return;
    }
    const alvo = this.ganhoAlvo;
    try {
      const agora = contexto.currentTime;
      ganho.gain.cancelScheduledValues(agora);
      ganho.gain.setValueAtTime(ganho.gain.value, agora);
      ganho.gain.linearRampToValueAtTime(alvo, agora + rampaS);
    } catch {
      ganho.gain.value = alvo;
    }
  }

  /**
   * Primeiro gesto do usuário na página destrava o áudio.
   *
   * O `RWebAudio` já chama `resume()` a cada buffer, mas só enquanto está
   * produzindo som. Quem abriu o jogo pausado, ou num navegador sem
   * `navigator.userActivation`, depende deste ouvinte.
   */
  #armarGesto(): void {
    if (this.#ouvintesDeGesto.length > 0 || typeof document === 'undefined') {
      return;
    }
    const alvo = document;
    const aoGesto = (): void => {
      void this.unlock();
    };
    for (const evento of ['pointerdown', 'keydown', 'touchend'] as const) {
      alvo.addEventListener(evento, aoGesto, { capture: true, passive: true });
      this.#ouvintesDeGesto.push(() => {
        alvo.removeEventListener(evento, aoGesto, { capture: true });
      });
    }
  }

  #desarmarGesto(): void {
    for (const remover of this.#ouvintesDeGesto) {
      remover();
    }
    this.#ouvintesDeGesto = [];
  }
}

/**
 * Já houve gesto do usuário nesta página?
 *
 * É a mesma pergunta que o Chrome faz para decidir se um `AudioContext` pode
 * tocar (`document-user-activation-required` olha a ativação pegajosa). Onde a
 * API não existe, responder `true` mantém o comportamento anterior: tentar.
 */
export function houveGestoDoUsuario(): boolean {
  return globalThis.navigator?.userActivation?.hasBeenActive ?? true;
}
