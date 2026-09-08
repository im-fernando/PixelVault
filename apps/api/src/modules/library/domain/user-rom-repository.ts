/**
 * Porta de persistência da biblioteca pessoal.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * Cresce com quem a usa: `buscarPorHash` nasceu com o upload (#71),
 * `registrar` com a verificação (#72), `buscarPorId` com o download
 * autorizado (#73) e `medirUso` com a cota por conta (#76). Listar e apagar
 * chegam com a biblioteca pessoal (#75). Método sem chamador é código morto
 * com aparência de arquitetura.
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
 * A #75 fechou a assinatura: {@link UserRomRepository.apagarReferencia}, que
 * apaga a linha e **responde** se aquela era a última a apontar para o
 * conteúdo. Não `apagarSeSemReferencia`, porque quem apaga o objeto não é o
 * repositório — ele não conhece storage nenhum. Uma coisa quem sabe é a
 * outra: o banco sabe contar, o caso de uso sabe coletar.
 */

import type { UsoDaBiblioteca } from './cota.js';

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
/**
 * A linha inteira, do jeito que o download precisa dela: o dono para decidir
 * se pode, a chave para assinar e o resto para o player não ter que perguntar
 * de novo.
 *
 * O `userId` sai daqui e vai direto para a pergunta de autorização — é ele o
 * dado que transforma "existe uma ROM com este id" em "esta ROM é sua". A
 * `storageKey` fica no servidor: é endereço de um objeto compartilhado por
 * conteúdo (ADR 0013), e o cliente nunca a vê.
 */
export interface RomDoUsuarioParaDownload {
  id: string;
  userId: string;
  sha256: string;
  storageKey: string;
  sizeBytes: number;
  fileName: string;
}

/**
 * A linha como a estante precisa dela.
 *
 * `gameId` vem junto porque é ele que decide de onde sai o título e a capa —
 * quem completa isso é o caso de uso, perguntando ao catálogo. O que a tabela
 * sabe sozinha é o resto.
 */
export interface RomNaBiblioteca {
  id: string;
  gameId: string | null;
  sha256: string;
  sizeBytes: number;
  fileName: string;
  isFavorite: boolean;
  uploadedAt: Date;
}

/** O que sobrou depois de tirar uma referência de cima de um conteúdo. */
export interface ReferenciaRemovida {
  /**
   * `true` quando nenhuma outra linha de `user_roms` aponta para aquele
   * `sha256` — ou seja, quando o objeto em `roms/<sha256>` ficou órfão e pode
   * ser coletado (ADR 0013, regra 3).
   */
  readonly ultimaReferencia: boolean;
}

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

  /**
   * A ROM com aquele id, seja de quem for, ou `null`.
   *
   * Repare que aqui **não** há `userId`, e a diferença para `buscarPorHash`
   * não é descuido: são perguntas de naturezas opostas. O hash é dado que o
   * cliente informa e que descreve conteúdo do mundo — filtrar por dono é o
   * que impede a consulta de virar oráculo de "esta ROM existe no
   * PixelVault". O id é opaco, sorteado pelo banco, e não descreve nada: para
   * saber se ele é seu é preciso primeiro achar a linha e olhar de quem ela é.
   *
   * Por isso quem chama tem uma obrigação, e ela está escrita em
   * `autorizar-download-de-rom.ts`: perguntar a autorização com o `userId`
   * que voltou daqui e responder 404 quando ela negar — o mesmo 404, byte a
   * byte, de um id que nunca existiu. Devolver a linha alheia sem essa
   * checagem seria entregar a ROM de outra pessoa.
   */
  buscarPorId(id: string): Promise<RomDoUsuarioParaDownload | null>;

  /**
   * Quanto a biblioteca daquela pessoa já ocupa, nos dois eixos da cota
   * (`domain/cota.ts`).
   *
   * Os dois números saem de uma agregação sobre `user_roms`, e não de uma
   * coluna de acumulador em `users` — é o mesmo raciocínio do `COUNT` acima,
   * com o mesmo desfecho: o dado já existe linha a linha, e um acumulador
   * seria uma segunda cópia da mesma verdade, capaz de divergir. Divergir
   * aqui recusaria o upload de quem tem espaço, ou liberaria o de quem não
   * tem.
   *
   * Trazer as linhas para somar em memória também está fora: uma biblioteca
   * no teto tem mil e quinhentas linhas, e nenhuma delas precisa sair do
   * banco para responder "quanto isto soma".
   */
  medirUso(userId: string): Promise<UsoDaBiblioteca>;

  /**
   * A biblioteca inteira de alguém, pronta para virar prateleira.
   *
   * Sem paginação, e o que torna isso seguro é a cota: `COTA_DE_ROMS_POR_CONTA`
   * fecha a conta em mil e quinhentas linhas por pessoa, sobre o índice de
   * `user_id`. Paginar aqui atenderia a um caso que a cota não deixa existir,
   * e cobraria do front uma mecânica que a estante não tem.
   *
   * A ordem é do banco, e não de quem chama: favorito primeiro, e depois o
   * mais recente. É a ordem que a estante mostra, e deixá-la aqui evita que
   * duas telas ordenem diferente a mesma coleção.
   *
   * A `storageKey` não sai: é endereço interno de um objeto compartilhado por
   * conteúdo (ADR 0013), e a listagem não tem o que fazer com ela.
   */
  listar(userId: string): Promise<RomNaBiblioteca[]>;

  /**
   * Apaga a referência daquela pessoa àquele conteúdo e diz se sobrou alguma.
   *
   * As duas coisas na mesma transação, e é isso que a ADR 0013 exige: o objeto
   * em `roms/<sha256>` não carrega dono, então "posso apagar o arquivo?" só
   * tem resposta confiável se a contagem enxergar a remoção que acabou de
   * acontecer. Contar antes, apagar depois — ou o contrário, em transações
   * diferentes — é o caminho para coletar um objeto que ainda tem dono.
   *
   * O que ela **não** faz é apagar o objeto. Repositório não conhece storage;
   * ele responde `ultimaReferencia` e quem coleta é o caso de uso, depois do
   * commit. Ver `remover-rom-da-biblioteca.ts` para o que isso custa e por que
   * o custo cai para o lado certo.
   */
  apagarReferencia(romId: string, sha256: string): Promise<ReferenciaRemovida>;

  /**
   * Marca ou desmarca a ROM como favorita.
   *
   * Recebe o estado desejado, e não um "alterna": alternar do lado do servidor
   * faria dois cliques simultâneos — ou um retry de rede — terminarem em
   * estado imprevisível. Com o valor explícito a operação é idempotente, que é
   * o que um `PUT` e um `DELETE` prometem, e não sobra resposta a devolver:
   * quem chamou já sabe o estado que pediu.
   */
  definirFavorito(romId: string, favorito: boolean): Promise<void>;
}
