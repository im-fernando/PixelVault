import type { SaveNaNuvem, TipoDeSaveNaNuvem } from './user-save.js';

/**
 * Porta de persistência do save na nuvem.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * `buscarPorRom` nasceu na #88; `gravar` chega na #89, com a gravação
 * condicional por revisão (regra 4 do ADR 0020). Porta cresce com quem a
 * usa; método sem chamador é código morto com aparência de arquitetura.
 */
export interface UserSaveRepository {
  /**
   * O save daquela conta para aquela ROM e tipo, ou `null`.
   *
   * A chave é a mesma do `@@unique([userId, sha256, kind])` da tabela — um
   * acerto de índice, não uma varredura.
   */
  buscarPorRom(
    userId: string,
    sha256: string,
    kind: TipoDeSaveNaNuvem,
  ): Promise<SaveNaNuvem | null>;

  /**
   * Grava um save só se a revisão em que o cliente se baseou ainda for a
   * atual — a atomicidade inteira do ADR 0020 (regra 4) mora nesta
   * assinatura.
   *
   * `revisaoEsperada: 0` significa "não sei de nenhum save ainda": a
   * implementação tenta criar a linha com `revision: 1`, e uma colisão
   * (alguém criou primeiro, na mesma corrida) vira o mesmo `conflito` que uma
   * revisão desatualizada.
   *
   * `revisaoEsperada > 0` tenta um `UPDATE` condicionado a
   * `revision = revisaoEsperada`. Zero linhas afetadas é conflito — pode ser
   * porque outra gravação já venceu, ou porque nunca existiu save nenhum e o
   * cliente errou a revisão que achava ter.
   *
   * As duas checagens são operações atômicas de banco (constraint única e
   * `UPDATE` condicional), não um `buscar` seguido de um `gravar` em dois
   * passos: é isso que faz duas gravações concorrentes com a mesma revisão
   * de base nunca as duas vencerem.
   */
  gravar(novo: NovoSaveNaNuvem): Promise<ResultadoDaGravacao>;
}

export interface NovoSaveNaNuvem {
  userId: string;
  sha256: string;
  kind: TipoDeSaveNaNuvem;
  /** A chave já escrita no storage — quem chama grava os bytes antes. */
  storageKey: string;
  sizeBytes: number;
  /** A revisão sobre a qual o cliente diz ter baseado esta gravação. `0` = "nenhuma". */
  revisaoEsperada: number;
}

export type ResultadoDaGravacao =
  | { tipo: 'gravado'; save: SaveNaNuvem }
  /**
   * `atual` é `null` só quando `revisaoEsperada > 0` e nunca existiu save
   * nenhum — a revisão que o cliente tinha em mãos não corresponde a nada
   * que o servidor já viu.
   */
  | { tipo: 'conflito'; atual: SaveNaNuvem | null };
