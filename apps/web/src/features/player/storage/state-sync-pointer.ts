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
 * Mora no `localStorage` pelo mesmo motivo do ponteiro de SRAM: é dado do
 * aparelho, não da conta, e não sincroniza entre dispositivos por conta
 * própria.
 */
export function lerRevisaoDeSaveStateSincronizada(romId: string, slot: SaveSlot): number {
  try {
    const bruto = localStorage.getItem(`${PREFIXO_DA_CHAVE}${romId}:${slot}`);
    if (bruto === null) return 0;
    const numero = Number(bruto);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
  } catch {
    // Aba anônima sem `localStorage`, ou cota de storage estourada: trata
    // como "nunca sincronizado" — o pior efeito colateral é tratar rotina
    // como divergência de novo, nunca perder dado (a tela de conflito da
    // #107 sempre exige escolha explícita antes de sobrescrever qualquer
    // lado).
    return 0;
  }
}

export function gravarRevisaoDeSaveStateSincronizada(
  romId: string,
  slot: SaveSlot,
  revision: number,
): void {
  try {
    localStorage.setItem(`${PREFIXO_DA_CHAVE}${romId}:${slot}`, String(revision));
  } catch {
    // Sem `localStorage`: o próximo boot volta a tratar este slot como
    // colisão nova. Não é erro que trave nada — só perde o silêncio da
    // rotina, mesmo raciocínio de `sram-sync-revision.ts`.
  }
}
