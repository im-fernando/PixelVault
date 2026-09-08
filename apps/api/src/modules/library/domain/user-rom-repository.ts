/**
 * Porta de persistência da biblioteca pessoal.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * Cresce com quem a usa: `buscarPorHash` nasceu com o upload (#71) e
 * `registrar` com a verificação (#72). Listar e apagar chegam com a biblioteca
 * pessoal (#75). Método sem chamador é código morto com aparência de
 * arquitetura.
 *
 * ## Contagem de referências: `COUNT`, não coluna
 *
 * A ADR 0013 exige saber quantos `user_roms` apontam para o mesmo conteúdo —
 * é o que permite apagar `roms/<sha256>` sem destruir a ROM de outra pessoa.
 * Isso será uma consulta `COUNT` sobre `user_roms.sha256`, e não uma coluna de
 * contador em lugar nenhum, por três razões:
 *
 * 1. **O dado já existe.** Cada linha de `user_roms` guarda o `sha256` dela;
 *    quantas linhas têm um hash é justamente o que a tabela diz. Uma coluna
 *    seria uma segunda cópia da mesma verdade, e cópia de verdade diverge.
 * 2. **Divergir aqui apaga arquivo.** Contador que erra para baixo coleta um
 *    objeto que ainda tem dono — a ADR chama isso de "bug que só aparece em
 *    produção, com dado real". Um `COUNT` dentro da mesma transação da remoção
 *    não tem como divergir, porque não é estado, é leitura.
 * 3. **A escala não pede.** O `COUNT` é sobre um índice, roda no caminho de
 *    remoção (raro), e nunca no de leitura. Coluna denormalizada se paga
 *    quando a consulta é quente; esta é fria.
 *
 * O método (`contarReferencias`, ou `apagarSeSemReferencia`) nasce na #75,
 * junto da rota de remoção que o chama — a mesma disciplina que manteve esta
 * porta com um método só até agora. O que a #72 fixa é a decisão, não a
 * assinatura.
 */

/** O bastante para responder "você já tem esse" e levar o front até a ROM. */
export interface RomDoUsuario {
  id: string;
  sha256: string;
}

/**
 * A referência que a verificação cria: o conteúdo já está em
 * `roms/<sha256>` e esta linha é o direito daquela pessoa a ele (ADR 0013).
 *
 * `gameId` nulo é o caso comum, não a exceção: só casa quem tem hash no
 * catálogo, e a biblioteca funciona sem isso (ADR 0006).
 */
export interface NovaRomDoUsuario {
  userId: string;
  sha256: string;
  storageKey: string;
  sizeBytes: number;
  fileName: string;
  gameId: string | null;
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

  /**
   * Cria a referência daquela pessoa àquele conteúdo, ou devolve a que já
   * existia.
   *
   * Idempotente de propósito. Concluir o mesmo envio duas vezes — clique
   * duplo, retentativa depois de timeout, dois arquivos iguais com nomes
   * diferentes — não é erro do usuário nem conflito a reportar: o conteúdo
   * dele continua na biblioteca dele, que é o que ele pediu. Quem garante isso
   * é o `@@unique([userId, sha256])` que existe desde a M0.
   */
  registrar(rom: NovaRomDoUsuario): Promise<RomDoUsuario>;
}
