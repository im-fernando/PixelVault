import type { BuscaDeCapa } from '../domain/busca-de-capa.js';
import type { GameRepository } from '../domain/game-repository.js';

export interface DependenciasDaCapa {
  jogos: Pick<GameRepository, 'jogoSemCapa' | 'definirCapa'>;
  busca: BuscaDeCapa;
}

/**
 * Dá capa a um jogo do catálogo que ainda não tem — se o provedor externo
 * tiver uma.
 *
 * Três passos e nenhuma regra escondida: pergunta ao catálogo se aquele jogo
 * ainda precisa de capa, pergunta ao provedor se ele tem uma, grava. Cada
 * pergunta pode responder "não", e "não" nunca é erro: jogo que já tem capa,
 * jogo que é homebrew (ADR 0016) e jogo que o provedor não conhece saem daqui
 * do mesmo jeito — sem capa, funcionando como antes.
 *
 * O que ela **não** faz é decidir quando rodar. Quem decide é
 * `identificar-rom.ts`, que a dispara fora da requisição; ver o cabeçalho de
 * lá para o porquê.
 *
 * Devolve a URL gravada, ou `null`. O retorno não tem cliente em produção
 * (ninguém espera por esta função) — ele existe para o teste poder afirmar o
 * que aconteceu sem espiar o repositório.
 */
export async function garantirCapaDoJogo(
  deps: DependenciasDaCapa,
  gameId: string,
): Promise<string | null> {
  const jogo = await deps.jogos.jogoSemCapa(gameId);
  if (jogo === null) return null;

  const capa = await deps.busca.buscar(jogo);
  if (capa === null) return null;

  await deps.jogos.definirCapa(gameId, capa);
  return capa;
}
