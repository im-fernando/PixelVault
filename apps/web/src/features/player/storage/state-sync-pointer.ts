import type { SaveSlot } from './save-key.js';

const PREFIXO_DA_CHAVE = 'pixelvault:state-revisao-sincronizada:';

/**
 * Até onde ESTE aparelho já reconciliou o save state na nuvem de um
 * `romId` e `slot` — issue #108, mesmo raciocínio de
 * `sram-sync-revision.ts`, agora por slot em vez de por ROM inteira.
 *
 * Save state não tem "vínculo de conta" único como a SRAM (#92): cada um
 * dos 4 slots é independente, então o ponteiro também precisa ser por
 * slot — sincronizar o slot A não pode fazer o B parecer sincronizado. Sem
 * este ponteiro não dá para separar "a nuvem tem a mesma revisão que este
 * aparelho já mandou ou já baixou" (rotina, mostrar "sincronizado") de "a
 * nuvem tem uma revisão que este aparelho nunca viu" (colisão, mostrar
 * "divergente" e abrir a tela da #107).
 *
 * ## Por que guarda `updatedAtLocal`, e não só `revision`
 *
 * `revision` sozinha responde "a nuvem mudou desde a última sincronização
 * deste aparelho?" — mas não responde a pergunta oposta: "o LOCAL mudou
 * desde então?". Sem isso, salvar de novo no mesmo slot depois de já tê-lo
 * sincronizado (a nuvem continua na mesma revisão, ninguém mais tocou nela)
 * faria a classificação continuar dizendo "sincronizado", e a galeria
 * escondia o botão de enviar — o save novo ficava preso no aparelho sem
 * nenhum caminho de UI para subir. `updatedAtLocal` é o `updatedAt` do save
 * local no exato momento em que este aparelho gravou (enviou) ou aplicou
 * (baixou) aquela revisão; comparar contra o `updatedAt` atual do slot local
 * é o que detecta "o local andou depois disso".
 *
 * Mora no `localStorage` pelo mesmo motivo do ponteiro de SRAM: é dado do
 * aparelho, não da conta, e não sincroniza entre dispositivos por conta
 * própria.
 */
export interface PointerDeSaveState {
  /** A revisão da nuvem que este aparelho já viu. */
  readonly revision: number;
  /** O `updatedAt` (epoch ms) do save local no momento desta sincronização. */
  readonly updatedAtLocal: number;
}

export function lerPointerDeSaveState(romId: string, slot: SaveSlot): PointerDeSaveState | null {
  try {
    const bruto = localStorage.getItem(`${PREFIXO_DA_CHAVE}${romId}:${slot}`);
    if (bruto === null) return null;
    const valor: unknown = JSON.parse(bruto);
    if (
      typeof valor !== 'object' ||
      valor === null ||
      typeof (valor as { revision?: unknown }).revision !== 'number' ||
      typeof (valor as { updatedAtLocal?: unknown }).updatedAtLocal !== 'number'
    ) {
      return null;
    }
    const pointer = valor as PointerDeSaveState;
    return pointer.revision >= 0 ? pointer : null;
  } catch {
    // Aba anônima sem `localStorage`, cota estourada, ou JSON corrompido:
    // trata como "nunca sincronizado" — o pior efeito colateral é tratar
    // rotina como divergência de novo, nunca perder dado (a tela de
    // conflito da #107 sempre exige escolha explícita antes de sobrescrever
    // qualquer lado).
    return null;
  }
}

export function gravarPointerDeSaveState(
  romId: string,
  slot: SaveSlot,
  revision: number,
  updatedAtLocal: number,
): void {
  try {
    const pointer: PointerDeSaveState = { revision, updatedAtLocal };
    localStorage.setItem(`${PREFIXO_DA_CHAVE}${romId}:${slot}`, JSON.stringify(pointer));
  } catch {
    // Sem `localStorage`: o próximo boot volta a tratar este slot como
    // colisão nova. Não é erro que trave nada — só perde o silêncio da
    // rotina, mesmo raciocínio de `sram-sync-revision.ts`.
  }
}
