/**
 * O que `leaderboards` precisa perguntar a quem é dono do dado — mesmo
 * desenho de `achievements/domain/portas-de-agregacao.ts`: a porta é
 * declarada por quem CONSOME, não importada do tipo de quem responde.
 * Compatibilidade estrutural, não import cruzando módulo.
 *
 * Diferente de `achievements`, aqui não existe pergunta na direção
 * contrária (`progress`/`identity` nunca precisam de nada de
 * `leaderboards`) — então não há ciclo real para o `dependency-cruiser`
 * reprovar, e `http/routes.ts` importa as funções que implementam estas
 * portas direto da fachada de `progress` e de `identity`, sem passar pela
 * composition root. Ver o cabeçalho de `../index.ts` para o raciocínio
 * completo.
 */

/** Uma linha do ranking de um jogo, como `progress` (dono de `user_games`) responde. */
export interface EntradaDeRanking {
  userId: string;
  totalPlaytimeSeconds: number;
  /** 1-based, estilo `RANK()` do SQL — contas empatadas compartilham a posição. */
  posicao: number;
}

/** As `limite` contas com mais playtime naquele jogo — `progress` responde. */
export type ObterRankingDoJogo = (gameId: string, limite: number) => Promise<EntradaDeRanking[]>;

/**
 * A posição da conta específica no ranking daquele jogo, mesmo fora do
 * `top` de `ObterRankingDoJogo` — `null` se ela nunca creditou playtime
 * nesse jogo.
 */
export type ObterPosicaoDaConta = (
  gameId: string,
  userId: string,
) => Promise<EntradaDeRanking | null>;

/** O que `identity` (dono da conta) sabe mostrar dela a qualquer pessoa — nunca o e-mail. */
export interface PerfilPublico {
  userId: string;
  handle: string;
  displayName: string;
}

/** Os perfis públicos de uma lista de contas, de uma vez — evita N+1 perguntas ao `identity`. */
export type ObterPerfisPublicos = (userIds: readonly string[]) => Promise<PerfilPublico[]>;
