import type { AchievementCode } from '@pixelvault/contracts';

const PREFIXO_DA_CHAVE = 'pixelvault:conquistas-vistas:';

/**
 * Quais códigos de conquista este NAVEGADOR já mostrou como notificação,
 * para esta conta — mesmo raciocínio de
 * `../player/storage/sram-sync-revision.ts`.
 *
 * Fica por conta (`userId`), não por aparelho no sentido genérico, mas mora
 * no `localStorage` porque é a mesma pergunta de lá: dado que a conta tem
 * uma conquista, ESTE navegador já avisou sobre ela, ou é a primeira vez que
 * ele encontra uma conquista que não tinha visto? Sem essa distinção, toda
 * vez que a conta abre o produto em outro aparelho (ou limpa o storage)
 * veria de novo o toast de tudo que já tinha — que é ruído, não novidade.
 *
 * `null` é resposta diferente de conjunto vazio: significa que este
 * navegador nunca registrou uma leitura de conquistas para esta conta. É a
 * distinção que `use-notificacao-de-conquista.ts` usa para não notificar,
 * como se fossem "novas", todas as conquistas que a conta já tinha antes da
 * primeira vez que abriu o produto neste aparelho — a primeira leitura só
 * grava a base, em silêncio; a partir da segunda, a diferença é novidade de
 * verdade.
 */
export function lerConquistasVistas(userId: string): ReadonlySet<AchievementCode> | null {
  try {
    const bruto = localStorage.getItem(PREFIXO_DA_CHAVE + userId);
    if (bruto === null) return null;
    const lista: unknown = JSON.parse(bruto);
    if (!Array.isArray(lista)) return null;
    return new Set(lista.filter((item): item is AchievementCode => typeof item === 'string'));
  } catch {
    // Aba anônima sem `localStorage`, JSON corrompido, ou cota estourada:
    // trata como "nunca visto". O pior efeito colateral é perder uma
    // notificação (a próxima leitura vira baseline de novo) — nunca notificar
    // à toa uma lista inteira de conquistas antigas.
    return null;
  }
}

export function gravarConquistasVistas(
  userId: string,
  codigos: ReadonlySet<AchievementCode>,
): void {
  try {
    localStorage.setItem(PREFIXO_DA_CHAVE + userId, JSON.stringify([...codigos]));
  } catch {
    // Sem `localStorage`: a próxima leitura volta a tratar tudo como novo.
    // Não é erro que trave nada — só perde o silêncio da rotina.
  }
}
