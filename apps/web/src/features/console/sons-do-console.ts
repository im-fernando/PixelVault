import type { TemaConsole } from './temas.js';

export type SomDoConsole =
  'navegar' | 'digitar' | 'confirmar' | 'voltar' | 'abrir' | 'iniciar' | 'apagar';
export const SONS_DO_CONSOLE: readonly SomDoConsole[] = [
  'navegar',
  'digitar',
  'confirmar',
  'voltar',
  'abrir',
  'iniciar',
  'apagar',
];

type Nota = readonly [semitons: number, atraso: number, duracao: number];
const NOTAS: Record<SomDoConsole, readonly Nota[]> = {
  navegar: [[0, 0, 0.075]],
  digitar: [[7, 0, 0.055]],
  apagar: [[-7, 0, 0.09]],
  confirmar: [
    [0, 0, 0.13],
    [7, 0.06, 0.17],
  ],
  voltar: [
    [0, 0, 0.1],
    [-5, 0.055, 0.14],
  ],
  abrir: [
    [0, 0, 0.12],
    [12, 0.07, 0.18],
  ],
  iniciar: [
    [0, 0, 0.16],
    [7, 0.085, 0.18],
    [12, 0.17, 0.24],
  ],
};
const TIMBRES: Record<TemaConsole, { base: number; onda: OscillatorType; ganho: number }> = {
  aurora: { base: 660, onda: 'sine', ganho: 0.065 },
  obsidian: { base: 440, onda: 'triangle', ganho: 0.055 },
  solstice: { base: 784, onda: 'sine', ganho: 0.055 },
  crt: { base: 523.25, onda: 'square', ganho: 0.022 },
};

/** Síntese curta e original, sem arquivos remotos; cada voz termina e se desconecta. */
export function agendarSomDoConsole(
  contexto: BaseAudioContext,
  som: SomDoConsole,
  tema: TemaConsole,
): () => void {
  const timbre = TIMBRES[tema];
  const vozes = NOTAS[som].map(([semitons, atraso, duracao]) => {
    const oscilador = contexto.createOscillator();
    const ganho = contexto.createGain();
    const inicio = contexto.currentTime + atraso;
    oscilador.type = timbre.onda;
    oscilador.frequency.setValueAtTime(timbre.base * 2 ** (semitons / 12), inicio);
    ganho.gain.setValueAtTime(0, inicio);
    ganho.gain.linearRampToValueAtTime(timbre.ganho, inicio + 0.005);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + duracao);
    ganho.gain.linearRampToValueAtTime(0, inicio + duracao + 0.008);
    oscilador.connect(ganho);
    ganho.connect(contexto.destination);
    let terminou = false;
    oscilador.onended = () => {
      terminou = true;
      oscilador.disconnect();
      ganho.disconnect();
    };
    oscilador.start(inicio);
    oscilador.stop(inicio + duracao + 0.01);
    return () => {
      if (terminou) return;
      ganho.gain.cancelScheduledValues(contexto.currentTime);
      ganho.gain.setTargetAtTime(0, contexto.currentTime, 0.004);
      oscilador.stop(contexto.currentTime + 0.02);
    };
  });
  return () => vozes.forEach((calar) => calar());
}

// Capturado antes do boot do core: o contexto da interface não deve passar
// pelo interceptor de áudio do emulador nem ser fechado junto com ele.
const AudioNativo = typeof window === 'undefined' ? undefined : window.AudioContext;

export class SonsDoConsole {
  private contexto: AudioContext | null = null;
  private retomando: Promise<void> | null = null;
  private ultimoSom = -Infinity;
  private geracao = 0;
  private usuarios = 0;
  private descarte: ReturnType<typeof setTimeout> | undefined;
  private vozes = new Map<() => void, number>();
  private ativo = true;
  private tema: TemaConsole = 'aurora';

  constructor(
    private criarContexto: () => AudioContext | null = () =>
      AudioNativo ? new AudioNativo() : null,
    private permitido: () => boolean = () =>
      typeof navigator === 'undefined' || navigator.userActivation?.hasBeenActive !== false,
    private visivel: () => boolean = () =>
      typeof document === 'undefined' || document.visibilityState !== 'hidden',
    private agora: () => number = () => performance.now(),
  ) {}

  configurar(tema: TemaConsole, ativo: boolean) {
    this.tema = tema;
    this.ativo = ativo;
    if (!ativo) this.silenciar();
  }

  usar(): () => void {
    this.usuarios++;
    clearTimeout(this.descarte);
    return () => {
      this.usuarios--;
      // Biblioteca e partida compartilham o mesmo banco. A janela curta
      // preserva a assinatura de entrada na troca de rota, sem vazar contexto.
      if (this.usuarios === 0) this.descarte = setTimeout(() => this.fechar(), 500);
    };
  }

  async tocar(som: SomDoConsole): Promise<'ok' | 'bloqueado' | 'indisponivel'> {
    if (!this.ativo || !this.visivel()) return 'ok';
    if (!this.permitido()) return 'bloqueado';
    const pedido = ++this.geracao;
    const solicitado = this.agora();
    try {
      if (!this.contexto || this.contexto.state === 'closed') this.contexto = this.criarContexto();
      const contexto = this.contexto;
      if (!contexto) return 'indisponivel';
      if (contexto.state !== 'running') {
        this.retomando ??= contexto.resume().finally(() => {
          this.retomando = null;
        });
        await this.retomando;
      }
      if (contexto.state !== 'running') return 'bloqueado';
      // Não acumular bipes enquanto o navegador aguarda liberar o áudio.
      if (
        pedido !== this.geracao ||
        !this.ativo ||
        !this.visivel() ||
        this.agora() - solicitado > 180
      )
        return 'ok';
      if (this.agora() - this.ultimoSom < 45) return 'ok';
      this.ultimoSom = this.agora();
      for (const [calar, fim] of this.vozes) if (fim < this.ultimoSom) this.vozes.delete(calar);
      this.vozes.set(agendarSomDoConsole(contexto, som, this.tema), this.ultimoSom + 500);
      return 'ok';
    } catch {
      return 'indisponivel';
    }
  }

  silenciar() {
    this.geracao++;
    this.vozes.forEach((_, calar) => calar());
    this.vozes.clear();
  }

  fechar() {
    this.silenciar();
    const contexto = this.contexto;
    this.contexto = null;
    this.retomando = null;
    this.ultimoSom = -Infinity;
    if (contexto && contexto.state !== 'closed') void contexto.close().catch(() => undefined);
  }
}
