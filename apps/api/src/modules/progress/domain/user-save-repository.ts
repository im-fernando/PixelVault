import type { SaveNaNuvem, TipoDeSaveNaNuvem } from './user-save.js';

/**
 * Porta de persistência do save na nuvem.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * Nasce só com a leitura, do mesmo jeito que `UserRomRepository` nasceu com
 * `buscarPorHash`: é o que a #90 (download) precisa, e o suficiente para
 * esta issue (#88) provar que a tabela nova é alcançável do domínio sem
 * vazar Prisma para cima (CLAUDE.md, "não usar Prisma fora de
 * infrastructure/"). A gravação com detecção de conflito por revisão é da
 * #89 — ela decide a política (bater a revisão recebida contra a do banco,
 * recusar com 409 quando divergir) antes de qualquer método de escrita
 * aparecer aqui. Porta cresce com quem a usa; método sem chamador é código
 * morto com aparência de arquitetura.
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
}
