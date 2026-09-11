import type { AgregadoDeJogoDoUsuario } from './agregado-de-jogo.js';
import type { EntradaDeRanking } from './ranking.js';

/**
 * Porta de persistência de `user_games`. Declarada no domínio e implementada
 * em `infrastructure/` — o domínio diz o que precisa, a infraestrutura
 * resolve como. Ver docs/adr/0004.
 *
 * Quatro métodos, um (ou dois) de cada issue que passou a escrever/ler esta
 * tabela:
 *
 * - `creditarHeartbeat` (#119, docs/adr/0009) grava `totalPlaytimeSeconds`/
 *   `lastPlayedAt` de verdade pela primeira vez, sempre pelo relógio do
 *   SERVIDOR — a implementação garante que duas abas da mesma conta, no
 *   mesmo jogo, nunca somam o mesmo intervalo duas vezes (ver o comentário
 *   de `PrismaUserGameRepository.creditarHeartbeat`).
 * - `agregarParaUsuario` (#120) lê o agregado da conta inteira — não por
 *   jogo — para as conquistas de coleção/jogos distintos/horas jogadas.
 * - `topDoRanking` e `posicaoDaConta` (#122) leem o ranking de UM jogo —
 *   ordenado por `totalPlaytimeSeconds`, decisão documentada em
 *   `leaderboards/index.ts`.
 */
export interface UserGameRepository {
  /**
   * Credita um heartbeat de playtime para `(userId, gameId)`, usando o
   * relógio do SERVIDOR (nunca um instante vindo de fora) tanto para medir o
   * intervalo quanto para gravar o novo `lastPlayedAt`.
   *
   * Cria a linha de `UserGame` se esta for a primeira vez que a conta
   * credita algo para este jogo — o primeiro heartbeat de sempre credita
   * zero segundos (não há marco anterior para medir intervalo, ver
   * `calcularCreditoDoHeartbeat`) e só estabelece o marco.
   */
  creditarHeartbeat(
    userId: string,
    gameId: string,
    tetoSegundos: number,
  ): Promise<CreditoDeHeartbeat>;

  /** O agregado da conta inteira — não por jogo, é isso que a conquista pede. */
  agregarParaUsuario(userId: string): Promise<AgregadoDeJogoDoUsuario>;

  /**
   * As `limite` contas com mais playtime NAQUELE jogo, ordenado decrescente.
   * Conta sem nenhuma linha em `user_games` para este jogo simplesmente não
   * aparece — não existe "zero horas" no ranking, existe "nunca jogou".
   */
  topDoRanking(gameId: string, limite: number): Promise<EntradaDeRanking[]>;

  /**
   * A posição da conta específica no ranking daquele jogo — mesmo que ela
   * esteja fora do `top` de `topDoRanking` (é o critério de aceite da #122).
   * `null` quando a conta não tem linha de `UserGame` para este jogo: sem
   * playtime creditado, não há posição para dar.
   */
  posicaoDaConta(gameId: string, userId: string): Promise<EntradaDeRanking | null>;
}

export interface CreditoDeHeartbeat {
  /** O que este heartbeat, especificamente, acabou de somar ao total. */
  segundosCreditados: number;
  /** O total da conta para este jogo, já com o crédito deste heartbeat somado. */
  totalPlaytimeSeconds: number;
}
