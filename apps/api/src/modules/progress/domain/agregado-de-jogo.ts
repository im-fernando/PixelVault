/**
 * O que `progress` sabe, agregado, sobre o jogo de uma conta — a pergunta
 * que `achievements` faz pela fachada (issue #120, ADR 0010).
 *
 * `user_games` existe desde a M0, mas nenhum código escrevia nele até aqui:
 * `lastPlayedAt` e `totalPlaytimeSeconds` são da issue #119 (playtime
 * honesto), possivelmente em paralelo com esta. Esta interface e o
 * repositório abaixo são só LEITURA — o lado que escreve continua sendo o
 * da #119, e é por isso que `segundosJogados` é sempre `0` até ela chegar:
 * a tabela existe, tem linhas ou não a depender de outro código que talvez
 * ainda não exista, mas `totalPlaytimeSeconds` de cada linha nunca sai de
 * zero sem quem credite playtime de verdade.
 */
export interface AgregadoDeJogoDoUsuario {
  /** Quantas linhas de `user_games` a conta tem — um jogo distinto jogado por linha. */
  readonly jogosDistintos: number;
  /** Soma de `totalPlaytimeSeconds` de todas elas. Ver o comentário acima. */
  readonly segundosJogados: number;
}
