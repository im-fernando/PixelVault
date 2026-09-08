/**
 * Porta de persistência da biblioteca pessoal.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * Nasce com um método só, e de propósito: é o que o upload da #71 precisa.
 * Listar, apagar e criar a referência depois da verificação chegam com as
 * issues que os usam (#72 e #75). Método sem chamador é código morto com
 * aparência de arquitetura.
 */

/** O bastante para responder "você já tem esse" e levar o front até a ROM. */
export interface RomDoUsuario {
  id: string;
  sha256: string;
}

export interface UserRomRepository {
  /**
   * A ROM daquela pessoa com aquele conteúdo, ou `null`.
   *
   * O `userId` não é filtro opcional nem conveniência de índice: é a regra da
   * ADR 0013 escrita na assinatura. Uma busca por hash sem dono responderia
   * "existe" sobre a ROM de terceiros, e conhecer o hash não dá direito a
   * nada.
   */
  buscarPorHash(userId: string, sha256: string): Promise<RomDoUsuario | null>;
}
