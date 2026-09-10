const PREFIXO_DA_CHAVE = 'pixelvault:sram-revisao-sincronizada:';

/**
 * Até onde ESTE aparelho, especificamente, já reconciliou a SRAM na nuvem de
 * um `romId` — issue #91.
 *
 * Não é o "vínculo" que a #92 decidiu ("existe save na nuvem" já é a fonte de
 * verdade de que a conta tem algo sincronizado). É outra pergunta: dado que a
 * nuvem tem algo, ESTE navegador específico já viu aquilo, ou é a primeira
 * vez que ele encontra um save de nuvem para este jogo? Sem essa distinção
 * não dá para saber se um `status: 'encontrado'` é rotina (outro dispositivo
 * já sincronizado, continuar em silêncio) ou colisão nova (SRAM local deste
 * aparelho nunca foi comparada com a da nuvem — exige a escolha explícita da
 * #92, ADR 0020).
 *
 * Mora no `localStorage` porque é dado do aparelho, do mesmo jeito que o save
 * local: não é dado de conta, não sincroniza entre dispositivos por conta
 * própria — é exatamente o ponteiro que só EXISTE por dispositivo.
 */
export function lerRevisaoSincronizada(romId: string): number {
  try {
    const bruto = localStorage.getItem(PREFIXO_DA_CHAVE + romId);
    if (bruto === null) return 0;
    const numero = Number(bruto);
    return Number.isFinite(numero) && numero >= 0 ? numero : 0;
  } catch {
    // Aba anônima sem `localStorage`, ou cota de storage do navegador
    // estourada: trata como "nunca sincronizado" — o pior efeito colateral é
    // tratar rotina como colisão de novo, nunca perder dado.
    return 0;
  }
}

export function gravarRevisaoSincronizada(romId: string, revision: number): void {
  try {
    localStorage.setItem(PREFIXO_DA_CHAVE + romId, String(revision));
  } catch {
    // Sem `localStorage`: a sincronização automática volta a tratar o
    // próximo boot como primeira vez. Não é erro que trave nada — só perde o
    // silêncio da rotina, como o comentário de `lerRevisaoSincronizada` já
    // documenta.
  }
}
