/**
 * Onde o adapter está no ciclo de vida.
 *
 * Existe como parte do contrato — e não só como sequência de eventos — porque
 * senão todo consumidor precisa remontar a mesma máquina de estados a partir
 * dos eventos que viu, e quem monta a tela depois de um `resume` vê um player
 * sem estado nenhum.
 */
export type EmulatorStatus =
  /** Criado, sem canvas. Nada foi carregado. */
  | 'idle'
  /** Canvas ligado, core pronto, sem ROM. */
  | 'mounted'
  /** Baixando/decodificando a ROM ou o core. Transitório. */
  | 'loading'
  /** ROM carregada, emulação ainda parada no quadro zero. */
  | 'ready'
  | 'running'
  | 'paused'
  /** Destruído. Toda operação a partir daqui é erro de ciclo de vida. */
  | 'destroyed';

/** Estados em que existe uma ROM carregada e uma máquina para inspecionar. */
export const ROM_LOADED_STATUSES: readonly EmulatorStatus[] = ['ready', 'running', 'paused'];
