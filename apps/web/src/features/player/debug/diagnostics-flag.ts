/**
 * Como o diagnóstico liga — e por que ele nasce desligado.
 *
 * Overlay de performance é ferramenta de quem está investigando, não decoração
 * de quem está jogando: ele cobre o canto da tela, e o laço que o alimenta é
 * trabalho por quadro que ninguém deveria pagar sem pedir.
 *
 * São dois caminhos, e eles resolvem problemas diferentes:
 *
 * - **`?diagnostico=1` na URL** liga antes de a página montar. É o único que
 *   serve para medir tempo de carga e áudio, porque esses marcos acontecem
 *   durante o boot e não dá para observá-los depois que já passaram.
 * - **F3** liga e desliga a qualquer momento, e é o que se usa para olhar o
 *   pacing durante a partida.
 */

/** Tecla que abre o painel, por `KeyboardEvent.code`. */
export const ATALHO_DE_DIAGNOSTICO = 'F3';

/** Como o atalho é lido para quem enxerga o painel. */
export const NOME_DO_ATALHO = 'F3';

export const PARAMETRO_DE_DIAGNOSTICO = 'diagnostico';

/** Fica no `sessionStorage`: diagnóstico é do momento, não é preferência. */
export const CHAVE_DE_DIAGNOSTICO = 'pixelvault:diagnostico';

const LIGADO = new Set(['1', 'true', 'sim', 'on']);

interface ArmazenamentoLegivel {
  getItem(chave: string): string | null;
}

/**
 * O diagnóstico já vem ligado nesta carga da página?
 *
 * Recebe a query e o armazenamento em vez de ler o `window` direto para poder
 * ser testado sem jsdom — a mesma razão de o mapa de teclas e a geometria de
 * tela morarem fora do React.
 */
export function diagnosticoLigadoNaEntrada(
  query: string,
  armazenamento: ArmazenamentoLegivel | null,
): boolean {
  const parametro = new URLSearchParams(query).get(PARAMETRO_DE_DIAGNOSTICO);
  if (parametro !== null) {
    // `?diagnostico` sem valor é intenção de ligar; `?diagnostico=0` é intenção
    // de desligar, e precisa ganhar de um valor guardado na sessão.
    return parametro === '' || LIGADO.has(parametro.toLowerCase());
  }
  try {
    const guardado = armazenamento?.getItem(CHAVE_DE_DIAGNOSTICO) ?? null;
    return guardado !== null && LIGADO.has(guardado.toLowerCase());
  } catch {
    // Navegador com armazenamento bloqueado joga ao ler. Diagnóstico desligado
    // é a resposta certa; derrubar o player não é.
    return false;
  }
}

/** Lê o estado inicial do ambiente real do navegador. */
export function diagnosticoLigadoNoNavegador(): boolean {
  if (typeof window === 'undefined') return false;
  return diagnosticoLigadoNaEntrada(window.location.search, lerArmazenamento());
}

/** Só de tocar em `sessionStorage` já joga em navegador com cookie bloqueado. */
function lerArmazenamento(): ArmazenamentoLegivel | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
