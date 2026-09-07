/**
 * De onde vieram os bytes que o tempo de carga gastou.
 *
 * A linha do tempo diz "o core levou 900 ms"; isto diz se foram 900 ms de rede
 * ou 900 ms de cache mais descompressão. Sem separar os dois, medir de novo
 * amanhã com o cache quente vira uma "melhoria de 90%" que não existe — e é
 * exatamente o tipo de falso positivo que um baseline deveria impedir.
 *
 * Lê a Resource Timing API do próprio navegador; nada é instrumentado à mão.
 */

/** Pedaços de URL que interessam ao diagnóstico do player. */
const PADROES = ['_libretro.wasm', '_libretro.js', '.sfc', '.smc'] as const;

export interface RecursoBaixado {
  readonly nome: string;
  readonly duracaoMs: number;
  /** Bytes que vieram pela rede. Zero com resposta de cache. */
  readonly bytesTransferidos: number;
  /** Tamanho do recurso já descomprimido. */
  readonly bytesDecodificados: number;
  readonly deCache: boolean;
}

interface EntradaDeRecurso {
  readonly name: string;
  readonly duration: number;
  readonly transferSize?: number;
  readonly encodedBodySize?: number;
  readonly decodedBodySize?: number;
}

/**
 * O que a Resource Timing viu do core e da ROM.
 *
 * Devolve lista vazia — e não erro — quando a API não existe ou nada bate: um
 * painel de diagnóstico que quebra a página que ele deveria diagnosticar não
 * serve para nada.
 */
export function recursosDoEmulador(
  entradas: readonly EntradaDeRecurso[] = lerEntradas(),
): readonly RecursoBaixado[] {
  const porNome = new Map<string, RecursoBaixado>();

  for (const entrada of entradas) {
    if (!PADROES.some((padrao) => entrada.name.includes(padrao))) continue;

    const transferidos = entrada.transferSize ?? 0;
    const decodificados = entrada.decodedBodySize ?? 0;
    const recurso: RecursoBaixado = {
      nome: entrada.name.split('/').pop() ?? entrada.name,
      duracaoMs: entrada.duration,
      bytesTransferidos: transferidos,
      bytesDecodificados: decodificados,
      // Corpo com conteúdo e nada trafegado só acontece com resposta servida do
      // cache do navegador.
      deCache: transferidos === 0 && decodificados > 0,
    };

    // A mesma URL pode aparecer duas vezes: o Nostalgist pede um pedaço da ROM
    // antes de baixá-la inteira. Duas linhas para o mesmo arquivo confundem, e a
    // que interessa é a que trouxe o arquivo.
    const anterior = porNome.get(recurso.nome);
    if (anterior === undefined || recurso.bytesDecodificados > anterior.bytesDecodificados) {
      porNome.set(recurso.nome, recurso);
    }
  }

  return [...porNome.values()];
}

function lerEntradas(): readonly EntradaDeRecurso[] {
  if (typeof performance === 'undefined' || typeof performance.getEntriesByType !== 'function') {
    return [];
  }
  return performance.getEntriesByType('resource') as unknown as readonly EntradaDeRecurso[];
}
