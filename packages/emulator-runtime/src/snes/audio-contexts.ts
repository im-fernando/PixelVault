/**
 * Rastreia os `AudioContext` que o RetroArch abre, para que `destroy()` consiga
 * fechá-los.
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
 */

type ConstrutorDeAudioContext = typeof AudioContext;

export interface ColetorDeAudioContext {
  readonly contextos: readonly AudioContext[];
  /** Devolve o construtor original quando nenhum coletor sobra. */
  parar(): void;
}

const pilha: AudioContext[][] = [];
let original: ConstrutorDeAudioContext | undefined;

export function coletarAudioContexts(): ColetorDeAudioContext {
  const coletados: AudioContext[] = [];
  pilha.push(coletados);
  instalar();

  let parado = false;
  return {
    contextos: coletados,
    parar(): void {
      if (parado) {
        return;
      }
      parado = true;
      const indice = pilha.indexOf(coletados);
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
      pilha.at(-1)?.push(this);
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
