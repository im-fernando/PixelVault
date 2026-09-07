/**
 * A conta que separa "60 fps" de "60 fps sem engasgo".
 *
 * FPS médio é a métrica que mais mente sobre emulador. Um segundo com 59
 * quadros de 16,7 ms e um de 100 ms fecha em 60 fps redondinhos, e é um
 * segundo em que a pessoa viu o jogo travar. Por isso o medidor guarda cada
 * intervalo entre quadros e devolve distribuição — percentis, desvio padrão e
 * contagem de atrasos —, não só a média.
 *
 * O módulo é puro de propósito: quem chama `registrar` é o `requestAnimationFrame`
 * do player, mas a matemática roda em teste, sem navegador e sem piscar.
 */

/**
 * O que estamos tentando acertar.
 *
 * O SNES NTSC entrega ~60,0988 quadros por segundo e o navegador apresenta no
 * vsync da tela. Arredondar para 60 Hz erra 0,16% — menos que qualquer coisa
 * que este medidor consiga distinguir de ruído.
 */
export const INTERVALO_ALVO_MS = 1000 / 60;

/**
 * Quantos intervalos entram na janela deslizante. 240 ≈ 4 segundos a 60 Hz.
 *
 * Janela curta demais faz o número dançar e vira ruído; longa demais esconde o
 * engasgo que aconteceu agora dentro da média dos últimos vinte segundos.
 */
export const TAMANHO_PADRAO_DA_JANELA = 240;

/**
 * A partir daqui não é engasgo, é interrupção.
 *
 * Aba oculta, pausa, alternar de janela e ponto de parada do depurador param o
 * `requestAnimationFrame` por segundos. Contar isso como quadro perdido faria
 * o overlay anunciar "trezentos quadros perdidos" para quem só trocou de aba —
 * exatamente o tipo de mentira com autoridade que este overlay existe para não
 * cometer. Fica registrado à parte, como interrupção.
 */
export const LIMITE_DE_INTERRUPCAO_MS = 1000;

/** A partir de quanto do alvo um intervalo conta como quadro atrasado. */
const FATOR_DE_ATRASO = 1.5;

export interface EstatisticaDePacing {
  /** Intervalos na janela. Abaixo de ~30 os percentis ainda não valem nada. */
  readonly amostras: number;
  readonly janelaMs: number;
  /** Quadros apresentados por segundo na janela. */
  readonly fps: number;
  readonly frameTimeMedioMs: number;
  readonly medianaMs: number;
  readonly p95Ms: number;
  readonly p99Ms: number;
  readonly piorMs: number;
  /** Desvio padrão dos intervalos: é a variância do pacing, em milissegundos. */
  readonly desvioPadraoMs: number;
  /** Quadros que chegaram 1,5× depois do alvo ou pior. */
  readonly quadrosAtrasados: number;
  /** Quantas apresentações o navegador pulou, somadas. */
  readonly quadrosPerdidos: number;
  /** Fração de quadros atrasados na janela, de 0 a 1. */
  readonly proporcaoAtrasada: number;
  /** Pausas longas descartadas da janela. Não são engasgo. */
  readonly interrupcoes: number;
}

export const PACING_VAZIO: EstatisticaDePacing = Object.freeze({
  amostras: 0,
  janelaMs: 0,
  fps: 0,
  frameTimeMedioMs: 0,
  medianaMs: 0,
  p95Ms: 0,
  p99Ms: 0,
  piorMs: 0,
  desvioPadraoMs: 0,
  quadrosAtrasados: 0,
  quadrosPerdidos: 0,
  proporcaoAtrasada: 0,
  interrupcoes: 0,
});

export interface OpcoesDoMedidor {
  readonly tamanhoDaJanela?: number;
  readonly intervaloAlvoMs?: number;
}

/**
 * Janela deslizante dos intervalos entre quadros apresentados.
 *
 * Mede o ritmo do navegador, e não o do core: se a emulação estourar o
 * orçamento do quadro, o `requestAnimationFrame` seguinte chega atrasado e o
 * atraso aparece aqui. É o que a pessoa sente. Quantos quadros o core emulou
 * é outra medida, e vem do evento `fps` do adapter.
 */
export class MedidorDePacing {
  readonly #intervalos: number[] = [];
  readonly #tamanhoDaJanela: number;
  readonly #intervaloAlvoMs: number;

  #anterior: number | null = null;
  #interrupcoes = 0;

  constructor({
    tamanhoDaJanela = TAMANHO_PADRAO_DA_JANELA,
    intervaloAlvoMs = INTERVALO_ALVO_MS,
  }: OpcoesDoMedidor = {}) {
    this.#tamanhoDaJanela = Math.max(2, Math.floor(tamanhoDaJanela));
    this.#intervaloAlvoMs = intervaloAlvoMs;
  }

  /** Instante do quadro, em milissegundos — o argumento do `rAF`, não `Date.now()`. */
  registrar(instanteMs: number): void {
    const anterior = this.#anterior;
    this.#anterior = instanteMs;
    if (anterior === null) return;

    const intervalo = instanteMs - anterior;
    // Relógio que andou para trás não existe em `rAF`, mas existe em teste e em
    // navegador com o relógio ajustado no meio da sessão.
    if (!Number.isFinite(intervalo) || intervalo <= 0) return;

    if (intervalo >= LIMITE_DE_INTERRUPCAO_MS) {
      this.#interrupcoes += 1;
      return;
    }

    this.#intervalos.push(intervalo);
    if (this.#intervalos.length > this.#tamanhoDaJanela) {
      this.#intervalos.splice(0, this.#intervalos.length - this.#tamanhoDaJanela);
    }
  }

  /**
   * Recomeça a contagem sem perder o histórico de interrupções.
   *
   * Usado quando a sessão de emulação é trocada: o pacing do jogo anterior não
   * diz nada sobre o próximo.
   */
  reiniciar(): void {
    this.#intervalos.length = 0;
    this.#anterior = null;
    this.#interrupcoes = 0;
  }

  /** Os intervalos crus da janela, do mais antigo ao mais recente. */
  get intervalos(): readonly number[] {
    return this.#intervalos;
  }

  estatistica(): EstatisticaDePacing {
    const intervalos = this.#intervalos;
    const amostras = intervalos.length;
    if (amostras === 0) {
      return { ...PACING_VAZIO, interrupcoes: this.#interrupcoes };
    }

    let soma = 0;
    let quadrosAtrasados = 0;
    let quadrosPerdidos = 0;
    const limiteDeAtraso = this.#intervaloAlvoMs * FATOR_DE_ATRASO;

    for (const intervalo of intervalos) {
      soma += intervalo;
      if (intervalo >= limiteDeAtraso) {
        quadrosAtrasados += 1;
        // `round` e não `floor`: um intervalo de 33,4 ms é um vsync perdido, e
        // 50 ms são dois. O alvo é o denominador honesto para essa conta.
        quadrosPerdidos += Math.max(1, Math.round(intervalo / this.#intervaloAlvoMs) - 1);
      }
    }

    const media = soma / amostras;
    let somaDosQuadrados = 0;
    for (const intervalo of intervalos) {
      const desvio = intervalo - media;
      somaDosQuadrados += desvio * desvio;
    }

    const ordenados = [...intervalos].sort((a, b) => a - b);

    return {
      amostras,
      janelaMs: soma,
      fps: 1000 / media,
      frameTimeMedioMs: media,
      medianaMs: percentil(ordenados, 0.5),
      p95Ms: percentil(ordenados, 0.95),
      p99Ms: percentil(ordenados, 0.99),
      piorMs: ordenados[ordenados.length - 1] ?? 0,
      desvioPadraoMs: Math.sqrt(somaDosQuadrados / amostras),
      quadrosAtrasados,
      quadrosPerdidos,
      proporcaoAtrasada: quadrosAtrasados / amostras,
      interrupcoes: this.#interrupcoes,
    };
  }
}

/**
 * Percentil por posição, sobre a lista já ordenada.
 *
 * Sem interpolação de propósito: o valor devolvido é um intervalo que
 * realmente aconteceu, e não uma média entre dois. Para diagnóstico de
 * engasgo, "este quadro levou 34 ms" vale mais que "o percentil interpolado
 * deu 31,7 ms".
 */
export function percentil(ordenados: readonly number[], fracao: number): number {
  if (ordenados.length === 0) return 0;
  const indice = Math.min(
    ordenados.length - 1,
    Math.max(0, Math.ceil(fracao * ordenados.length) - 1),
  );
  return ordenados[indice] ?? 0;
}

export type VereditoDePacing = 'estavel' | 'irregular' | 'engasgando' | 'sem-dados';

/**
 * O julgamento que o overlay mostra em uma palavra.
 *
 * Olha primeiro para atraso e variância, e só depois para a média. É a regra
 * que a issue #26 pede: 58 fps estáveis se jogam melhor que 60 com stutter, e
 * um painel que anuncia "60 fps" enquanto o jogo trava mente com autoridade.
 */
export function julgarPacing(estatistica: EstatisticaDePacing): VereditoDePacing {
  if (estatistica.amostras < 30) return 'sem-dados';
  if (estatistica.proporcaoAtrasada > 0.02 || estatistica.p99Ms > INTERVALO_ALVO_MS * 2) {
    return 'engasgando';
  }
  if (estatistica.desvioPadraoMs > INTERVALO_ALVO_MS * 0.25 || estatistica.quadrosAtrasados > 0) {
    return 'irregular';
  }
  return 'estavel';
}
