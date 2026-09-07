import type { MarcoDeStatus } from '../use-emulator.js';

/**
 * Quanto tempo passa entre abrir a página e a tela começar a andar.
 *
 * É a parte da performance que a pessoa sente antes de qualquer fps: 4 MB de
 * WASM, meio mega de ROM e o core montando a máquina. Sem isto, "o jogo demora
 * a abrir" é uma reclamação sem número.
 *
 * A linha do tempo é lida das transições de `status` do adapter, e não de
 * ganchos novos dentro do runtime. A sequência do contrato já é a linha do
 * tempo:
 *
 * ```
 * idle → loading → mounted → loading → ready → running
 *        └─ core ─┘         └─ ROM ──┘       └ 1º quadro
 * ```
 *
 * `mount()` baixa e prepara o `.js` e o `.wasm` do core; `loadGame()` lê a ROM
 * e monta a máquina; o primeiro quadro é marcado de fora, pelo laço de quadros
 * do player.
 */

export interface LinhaDoTempoDeCarga {
  /** Baixar e preparar os assets do core. `null` enquanto não terminou. */
  readonly coreMs: number | null;
  /** Ler a ROM e montar a máquina. */
  readonly romMs: number | null;
  /** De máquina pronta até o primeiro quadro apresentado. */
  readonly primeiroQuadroMs: number | null;
  /** Do início ao primeiro quadro. É o que a pessoa espera olhando a tela. */
  readonly totalMs: number | null;
}

export const CARGA_VAZIA: LinhaDoTempoDeCarga = Object.freeze({
  coreMs: null,
  romMs: null,
  primeiroQuadroMs: null,
  totalMs: null,
});

/**
 * Reparte a carga entre core, ROM e primeiro quadro.
 *
 * Só a **primeira** ocorrência de cada marco conta. `importSram` derruba e
 * remonta a máquina no meio da partida, passando por `loading` e `ready` de
 * novo (ver `SnesEmulatorAdapter`); tratar isso como carga transformaria um
 * save carregado em regressão de tempo de abertura.
 *
 * `primeiroQuadroMs` chega de fora porque o runtime não conta quadro de vídeo:
 * quem marca é o `requestAnimationFrame` do player, então o instante é o da
 * primeira oportunidade de pintura com o core já andando — e não o instante
 * exato em que o core produziu a primeira imagem. A diferença é de um quadro, e
 * está registrada aqui porque inventar precisão é pior que admitir a folga.
 */
export function linhaDoTempoDaCarga(
  marcos: readonly MarcoDeStatus[],
  primeiroQuadroMs: number | null,
): LinhaDoTempoDeCarga {
  const inicio = marcos[0]?.instanteMs;
  if (inicio === undefined) return CARGA_VAZIA;

  const primeiro = (status: MarcoDeStatus['status']): number | null =>
    marcos.find((marco) => marco.status === status)?.instanteMs ?? null;

  const pronto = primeiro('ready');
  // Um adapter pode ir direto para `ready` sem `mounted` observável. Sem esta
  // folga, o tempo do core ficaria eternamente nulo e o total mediria menos do
  // que a pessoa esperou.
  const montado = primeiro('mounted') ?? pronto;
  const quadro = pronto === null ? null : primeiroQuadroMs;

  return {
    coreMs: montado === null ? null : montado - inicio,
    romMs: montado === null || pronto === null ? null : pronto - montado,
    primeiroQuadroMs: pronto === null || quadro === null ? null : quadro - pronto,
    totalMs: quadro === null ? null : quadro - inicio,
  };
}
