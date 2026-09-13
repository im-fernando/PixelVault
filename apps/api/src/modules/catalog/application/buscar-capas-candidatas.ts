import type { BuscaDeCapaPorNome, CandidatoDeCapa } from '../domain/busca-de-capa-por-nome.js';
import type { GameRepository } from '../domain/game-repository.js';

export interface DependenciasDaBuscaDeCandidatas {
  jogos: Pick<GameRepository, 'jogoSemCapa'>;
  buscarCandidatas: BuscaDeCapaPorNome;
}

/**
 * As duas respostas, no mesmo espírito de `identificar-capa-manual.ts`:
 * `semOQueProcurar` cobre jogo inexistente, com capa, ou homebrew (ADR
 * 0016) — não faz sentido oferecer lista de candidatos para nenhum dos três.
 */
export type ResultadoDaBuscaDeCandidatas =
  { tipo: 'semOQueProcurar' } | { tipo: 'candidatas'; itens: readonly CandidatoDeCapa[] };

/**
 * A lista que alimenta o "Identificar capa" — a pessoa digita um trecho, e
 * aqui volta o que o provedor tem de verdade com aquele trecho no nome. É a
 * diferença entre `identificarCapaManual` (aposta num nome exato) e isto
 * (mostra os nomes reais para escolher, ver o cabeçalho de
 * `busca-de-capa-por-nome.ts` para o porquê de serem portas diferentes).
 */
export async function buscarCapasCandidatas(
  deps: DependenciasDaBuscaDeCandidatas,
  gameId: string,
  termo: string,
): Promise<ResultadoDaBuscaDeCandidatas> {
  const jogo = await deps.jogos.jogoSemCapa(gameId);
  if (jogo === null) return { tipo: 'semOQueProcurar' };

  const itens = await deps.buscarCandidatas(jogo.systemId, termo);
  return { tipo: 'candidatas', itens };
}
