import { useQuery } from '@tanstack/react-query';
import { leaderboardResponseSchema, type LeaderboardResponse } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { useSessao } from '../auth/sessao.js';

/** Quantas posições `GET /api/leaderboards/games/:gameId` mostra por padrão. */
export const TAMANHO_DO_TOP = 10;

/**
 * O ranking de playtime de um jogo — issue #122. Ranking POR JOGO, não geral
 * da conta (ver o cabeçalho de `apps/api/src/modules/leaderboards/index.ts`
 * para o porquê): a `gameId` é a mesma que identifica o jogo no catálogo.
 *
 * A consulta só sai com sessão, pelo mesmo motivo de `useBiblioteca`: a rota
 * responde 401 para visitante, e a posição da própria conta só existe para
 * quem está logado.
 */
export function useRankingDoJogo(gameId: string) {
  const sessao = useSessao();

  return useQuery<LeaderboardResponse>({
    queryKey: ['ranking', gameId],
    queryFn: () =>
      apiFetch(
        `/api/leaderboards/games/${encodeURIComponent(gameId)}?limit=${TAMANHO_DO_TOP}`,
        leaderboardResponseSchema,
      ),
    enabled: sessao.estado === 'autenticado',
  });
}
