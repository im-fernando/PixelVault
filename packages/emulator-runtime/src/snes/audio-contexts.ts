/**
 * A única alça que existe sobre o `AudioContext` que o RetroArch abre.
 *
 * **Por que isto é necessário:** o driver de áudio do RetroArch em WASM é o
 * `RWebAudio`, que guarda o contexto numa variável do escopo do módulo do core
 * (`RWA.context`) e não a exporta. Nem o Nostalgist nem o `Module` dão acesso a
 * ela. Medido no navegador: dez ciclos de criar e destruir deixaram **catorze
 * `AudioContext` no estado `running`** depois de todos os `exit()`. O Chrome
 * limita o número de contextos por documento, então o vazamento não é só
 * memória — depois de algumas partidas o áudio simplesmente para de abrir.
 *
 * A única alça que sobra é o construtor. O coletor troca
 * `globalThis.AudioContext` por uma subclasse que registra o que for criado e
 * devolve o original quando o último coletor para.
 *
 * Contextos novos vão para o coletor **mais recente**, e não para todos: quem
 * acabou de subir um core é quem criou o contexto. Fechar o contexto de outro
 * adapter seria pior que vazar o próprio.
 *
 * A mesma subclasse é onde `resume()` passa a ser filtrado. O `RWebAudio`
 * chama `resume()` a cada buffer enquanto o contexto não está tocando — cerca
 * de cem vezes por segundo — e o Chrome loga *"The AudioContext was not
 * allowed to start"* a cada tentativa recusada. Segurar as tentativas que não
 * têm chance nenhuma de dar certo é o que esvazia o console. Ver ADR 0015.
 */

type ConstrutorDeAudioContext = typeof AudioContext;

export interface OpcoesDoColetor {
  /** Chamado com o contexto recém-construído, antes do primeiro buffer. */
  readonly aoCriar?: (contexto: AudioContext) => void;
  /**
   * Enquanto responder `false`, `resume()` não chega ao navegador e resolve
   * calado. Serve para não insistir no que a política de autoplay já recusou.
   */
  readonly podeRetomar?: () => boolean;
}

export interface ColetorDeAudioContext {
  readonly contextos: readonly AudioContext[];
  /** Devolve o construtor original quando nenhum coletor sobra. */
  parar(): void;
}

interface EntradaDaPilha {
  readonly contextos: AudioContext[];
  readonly opcoes: OpcoesDoColetor;
}

const pilha: EntradaDaPilha[] = [];
/** Qual coletor criou cada contexto — é o que `resume()` consulta. */
const donos = new WeakMap<AudioContext, EntradaDaPilha>();
let original: ConstrutorDeAudioContext | undefined;

export function coletarAudioContexts(opcoes: OpcoesDoColetor = {}): ColetorDeAudioContext {
  const entrada: EntradaDaPilha = { contextos: [], opcoes };
  pilha.push(entrada);
  instalar();

  let parado = false;
  return {
    contextos: entrada.contextos,
    parar(): void {
      if (parado) {
        return;
      }
      parado = true;
      const indice = pilha.indexOf(entrada);
      if (indice >= 0) {
        pilha.splice(indice, 1);
      }
      desinstalar();
    },
  };
}

/** Fecha o que der. Contexto já fechado estoura, e isso não é problema de ninguém. */
export async function fecharAudioContexts(contextos: readonly AudioContext[]): Promise<void> {
  await Promise.all(
    contextos.map(async (contexto) => {
      try {
        if (contexto.state !== 'closed') {
          await contexto.close();
        }
      } catch {
        // Fechar duas vezes, ou fechar um contexto que o navegador já derrubou,
        // não muda nada do que interessa aqui.
      }
    }),
  );
}

function instalar(): void {
  if (original !== undefined || typeof globalThis.AudioContext !== 'function') {
    return;
  }
  original = globalThis.AudioContext;
  const Base = original;
  globalThis.AudioContext = class extends Base {
    constructor(...argumentos: ConstructorParameters<ConstrutorDeAudioContext>) {
      super(...argumentos);
      const entrada = pilha.at(-1);
      if (entrada !== undefined) {
        entrada.contextos.push(this);
        donos.set(this, entrada);
        entrada.opcoes.aoCriar?.(this);
      }
    }

    override resume(): Promise<void> {
      if (donos.get(this)?.opcoes.podeRetomar?.() === false) {
        return Promise.resolve();
      }
      return super.resume();
    }
  };
}

function desinstalar(): void {
  if (pilha.length > 0 || original === undefined) {
    return;
  }
  globalThis.AudioContext = original;
  original = undefined;
}
