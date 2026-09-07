/**
 * O que dá para saber do áudio sem o runtime abrir a mão.
 *
 * O `EmulatorAdapter` não expõe o `AudioContext`, e o buffer real do core
 * (quantos quadros de amostra estão na fila, quantos underruns aconteceram) só
 * vai existir quando o AudioWorklet da issue #25 entrar. Até lá, a sonda lê o
 * que a plataforma já publica: taxa de amostragem, estado e as duas latências
 * de saída — que são a profundidade do buffer vista de fora.
 *
 * **Isto não detecta estalo.** Latência alta e estável soa bem; underrun soa
 * mal e não aparece aqui. O painel diz isso com todas as letras em vez de
 * deixar quem lê concluir que o áudio está saudável porque a linha existe.
 *
 * A sonda embrulha o construtor global porque é a única alça que sobra: o
 * contexto nasce dentro do boot do RetroArch. O mesmo caminho que a verificação
 * em navegador do `emulator-runtime` já usa — quem observa não pode depender do
 * instrumento do observado. Ela só é instalada com o diagnóstico ligado, e sai
 * inteira no desligamento.
 */

export interface EstadoDoAudio {
  readonly contextos: number;
  readonly abertos: number;
  readonly taxaDeAmostragem: number | null;
  readonly estado: string | null;
  /** Buffer interno do navegador, em milissegundos. */
  readonly latenciaBaseMs: number | null;
  /** Estimativa do tempo até o som sair da caixa, em milissegundos. */
  readonly latenciaDeSaidaMs: number | null;
}

export const AUDIO_SEM_SONDA: EstadoDoAudio = Object.freeze({
  contextos: 0,
  abertos: 0,
  taxaDeAmostragem: null,
  estado: null,
  latenciaBaseMs: null,
  latenciaDeSaidaMs: null,
});

interface ContextoObservavel {
  readonly sampleRate: number;
  readonly state: string;
  readonly baseLatency?: number;
  readonly outputLatency?: number;
}

type ConstrutorDeContexto = new (...argumentos: never[]) => ContextoObservavel;

interface JanelaComAudio {
  AudioContext?: ConstrutorDeContexto;
  webkitAudioContext?: ConstrutorDeContexto;
}

export interface SondaDeAudio {
  ler(): EstadoDoAudio;
  desinstalar(): void;
}

/**
 * Começa a observar contextos de áudio criados **a partir de agora**.
 *
 * Contexto que já existia não é capturado: por isso o painel só tem número de
 * áudio quando o diagnóstico foi ligado antes de o jogo carregar. Ligar no meio
 * da partida mostra "nenhum contexto observado", que é a verdade.
 */
export function instalarSondaDeAudio(janela: JanelaComAudio = window): SondaDeAudio {
  const Original = janela.AudioContext ?? janela.webkitAudioContext;
  if (Original === undefined) {
    return { ler: () => AUDIO_SEM_SONDA, desinstalar: () => undefined };
  }

  const contextos: ContextoObservavel[] = [];
  const Observado = class extends Original {
    constructor(...argumentos: never[]) {
      super(...argumentos);
      contextos.push(this);
    }
  };

  const tinhaProprio = Object.prototype.hasOwnProperty.call(janela, 'AudioContext');
  janela.AudioContext = Observado;

  return {
    ler: () => resumir(contextos),
    desinstalar: () => {
      if (tinhaProprio) {
        janela.AudioContext = Original;
      } else {
        delete janela.AudioContext;
      }
      contextos.length = 0;
    },
  };
}

function resumir(contextos: readonly ContextoObservavel[]): EstadoDoAudio {
  const abertos = contextos.filter((contexto) => contexto.state !== 'closed');
  // O último aberto é o do jogo em curso: `importSram` relança a máquina e o
  // adapter fecha o anterior, então olhar para o primeiro mostraria um contexto
  // morto.
  const atual = abertos[abertos.length - 1] ?? contextos[contextos.length - 1] ?? null;
  return {
    contextos: contextos.length,
    abertos: abertos.length,
    taxaDeAmostragem: atual?.sampleRate ?? null,
    estado: atual?.state ?? null,
    latenciaBaseMs: emMilissegundos(atual?.baseLatency),
    latenciaDeSaidaMs: emMilissegundos(atual?.outputLatency),
  };
}

function emMilissegundos(segundos: number | undefined): number | null {
  return typeof segundos === 'number' && Number.isFinite(segundos) ? segundos * 1000 : null;
}
