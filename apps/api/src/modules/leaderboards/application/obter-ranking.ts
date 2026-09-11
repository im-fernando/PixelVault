import type { LinhaDoRanking } from '../domain/linha-do-ranking.js';
import type {
  EntradaDeRanking,
  ObterPerfisPublicos,
  ObterPosicaoDaConta,
  ObterRankingDoJogo,
} from '../domain/portas.js';

export interface DependenciasDoRanking {
  obterRanking: ObterRankingDoJogo;
  obterPosicaoDaConta: ObterPosicaoDaConta;
  obterPerfis: ObterPerfisPublicos;
}

export interface RankingDoJogo {
  gameId: string;
  top: LinhaDoRanking[];
  /** A posição da própria conta — `null` se ela nunca creditou playtime nesse jogo. */
  minhaPosicao: LinhaDoRanking | null;
}

/**
 * O ranking de um jogo, pronto para `GET /api/leaderboards/games/:gameId`:
 * as `limite` primeiras posições e a posição da própria conta, mesmo que
 * ela esteja fora delas — o critério de aceite da #122.
 *
 * ## Por que junta as duas perguntas a `progress` com as ids que faltam ao
 * `identity` numa única chamada, e não uma por linha
 *
 * `top` e `minhaPosicao` podem repetir uma conta (a própria, se ela estiver
 * dentro do `top`) ou não — e os dois precisam do mesmo par
 * handle/displayName do `identity`. Em vez de perguntar por linha (N+1 ao
 * módulo que nem é dono do playtime), junta todos os ids que faltam ANTES
 * de perguntar, e pergunta uma vez só.
 */
export async function obterRankingDoJogo(
  deps: DependenciasDoRanking,
  gameId: string,
  userId: string,
  limite: number,
): Promise<RankingDoJogo> {
  const [top, minhaEntrada] = await Promise.all([
    deps.obterRanking(gameId, limite),
    deps.obterPosicaoDaConta(gameId, userId),
  ]);

  const idsNecessarios = new Set(top.map((entrada) => entrada.userId));
  if (minhaEntrada !== null) idsNecessarios.add(minhaEntrada.userId);

  const perfis = await deps.obterPerfis([...idsNecessarios]);
  const perfilPorId = new Map(perfis.map((perfil) => [perfil.userId, perfil]));

  function linha(entrada: EntradaDeRanking): LinhaDoRanking | null {
    const perfil = perfilPorId.get(entrada.userId);
    // Não deveria faltar — o perfil é da mesma conta que jogou —, mas se a
    // conta foi apagada entre as duas consultas, a linha cai fora da
    // resposta em vez de sair com handle/nome vazios.
    if (perfil === undefined) return null;
    return {
      userId: perfil.userId,
      handle: perfil.handle,
      displayName: perfil.displayName,
      totalPlaytimeSeconds: entrada.totalPlaytimeSeconds,
      posicao: entrada.posicao,
    };
  }

  return {
    gameId,
    top: top.map(linha).filter((item): item is LinhaDoRanking => item !== null),
    minhaPosicao: minhaEntrada === null ? null : linha(minhaEntrada),
  };
}
