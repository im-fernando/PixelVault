/**
 * O ranking de playtime por jogo (issue #122) — decidido POR JOGO, não geral
 * da conta (ver o cabeçalho de `leaderboards/index.ts` para o raciocínio
 * completo). `progress` é quem responde, porque é o dono de `user_games`
 * (ADR 0009) — `leaderboards` só pergunta, pela fachada, do mesmo jeito que
 * `achievements` já pergunta `agregadoDeJogoDoUsuario`.
 */

/** Uma linha do ranking de um jogo: quem, quanto tempo, em que posição. */
export interface EntradaDeRanking {
  userId: string;
  totalPlaytimeSeconds: number;
  /** 1-based, estilo `RANK()` do SQL — contas empatadas compartilham a posição. */
  posicao: number;
}

/**
 * Calcula a posição (estilo `RANK()`, não `ROW_NUMBER()`) de cada linha de
 * uma lista JÁ ORDENADA decrescente por `totalPlaytimeSeconds`.
 *
 * Função pura — sem Prisma, sem banco — para a regra de empate (duas contas
 * com o mesmo total compartilham a mesma posição, e a próxima posição salta
 * o número de contas empatadas, não soma 1) se testar isolada da
 * infraestrutura. `PrismaUserGameRepository.topDoRanking` só chama isto
 * depois de buscar as linhas já ordenadas.
 */
export function calcularPosicoes(
  linhas: readonly { userId: string; totalPlaytimeSeconds: number }[],
): EntradaDeRanking[] {
  let posicaoAtual = 0;
  let ultimoValor: number | null = null;

  return linhas.map((linha, indice) => {
    if (linha.totalPlaytimeSeconds !== ultimoValor) {
      posicaoAtual = indice + 1;
      ultimoValor = linha.totalPlaytimeSeconds;
    }
    return {
      userId: linha.userId,
      totalPlaytimeSeconds: linha.totalPlaytimeSeconds,
      posicao: posicaoAtual,
    };
  });
}
