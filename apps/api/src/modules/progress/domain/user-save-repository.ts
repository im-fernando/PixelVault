import type { UsoDoSaveNaNuvem } from './cota.js';
import type { SaveNaNuvem, SlotDeSaveState, TipoDeSaveNaNuvem } from './user-save.js';

/**
 * Porta de persistência do save na nuvem.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * `buscarPorRom` nasceu na #88; `gravar` chega na #89, com a gravação
 * condicional por revisão (regra 4 do ADR 0020); `medirUso` chega na #93,
 * para a cota de `domain/cota.ts`. O eixo `slot` chega na #104, para
 * `kind: 'state'` — omitido (`undefined`), é a mesma pergunta de sempre
 * sobre a SRAM única da conta. `listarPorRom` chega na #106, para a galeria
 * de slots ver os 4 de uma vez. Porta cresce com quem a usa; método sem
 * chamador é código morto com aparência de arquitetura.
 */
export interface UserSaveRepository {
  /**
   * O save daquela conta para aquela ROM, tipo e slot, ou `null`.
   *
   * `slot` só faz sentido para `kind: 'state'` — omita para `'sram'`. A
   * chave é a mesma do `@@unique([userId, sha256, kind, slot])` da tabela
   * (a implementação traduz a ausência de `slot` para a sentinela `-1` do
   * banco — ver o comentário do model `UserSave` em schema.prisma) — um
   * acerto de índice, não uma varredura.
   */
  buscarPorRom(
    userId: string,
    sha256: string,
    kind: TipoDeSaveNaNuvem,
    slot?: SlotDeSaveState,
  ): Promise<SaveNaNuvem | null>;

  /**
   * Todos os saves da conta para aquele conteúdo e tipo — os até 4 slots de
   * save state de uma ROM, de uma vez (#106).
   *
   * Existe porque `buscarPorRom` é por slot único, e a galeria
   * (`GaleriaDeSlots`) precisa ver o estado dos 4 juntos para desenhar cada
   * botão sem 4 requisições. SRAM não tem por que chamar isto — ela só tem
   * uma linha por ROM, e `buscarPorRom` já responde sozinho.
   */
  listarPorRom(userId: string, sha256: string, kind: TipoDeSaveNaNuvem): Promise<SaveNaNuvem[]>;

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

  /**
   * Quanto a conta já ocupa de save na nuvem, somado de todos os `romId` —
   * o que `estouraCotaDeSave` (`domain/cota.ts`) precisa para decidir uma
   * gravação.
   *
   * Uma agregação sobre `user_saves`, e não uma coluna de acumulador em
   * `users`: mesmo raciocínio de `UserRomRepository.medirUso` — o dado já
   * existe linha a linha, e um acumulador seria uma segunda cópia da mesma
   * verdade, capaz de divergir.
   */
  medirUso(userId: string): Promise<UsoDoSaveNaNuvem>;
}

export interface NovoSaveNaNuvem {
  userId: string;
  sha256: string;
  kind: TipoDeSaveNaNuvem;
  /** Só para `kind: 'state'` — omita para `'sram'` (vira a sentinela `-1` no banco). */
  slot?: SlotDeSaveState;
  /** A chave já escrita no storage — quem chama grava os bytes antes. */
  storageKey: string;
  sizeBytes: number;
  /** Só para `kind: 'state'` — a #105 é quem passa a gravar isto de verdade. */
  thumbnailKey?: string;
  /**
   * Só para `kind: 'state'` — o tamanho do objeto de `thumbnailKey`, para a
   * cota (#109) conseguir contar um objeto que `sizeBytes` nunca descreveu.
   */
  thumbnailSizeBytes?: number;
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
