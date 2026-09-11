import { useQuery, type QueryKey } from '@tanstack/react-query';
import { achievementListResponseSchema, type AchievementListResponse } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { useSessao } from '../auth/sessao.js';

/**
 * Client HTTP de `GET /api/achievements` — mesma convenção de
 * `use-biblioteca.ts` (`library`).
 *
 * Exportada porque `use-notificacao-de-conquista.ts` precisa invalidar esta
 * mesma consulta depois de qualquer ação que possa desbloquear uma conquista
 * (enviar ROM, gravar save state, sincronizar SRAM) — a rota só devolve o
 * estado atual, sem evento de desbloqueio separado (ver o comentário de
 * `achievementListResponseSchema`), então "desbloqueou agora" só existe
 * comparando duas leituras desta mesma chave.
 */
export const CHAVE_DAS_CONQUISTAS: QueryKey = ['conquistas'];

/**
 * As conquistas que a conta já desbloqueou.
 *
 * Mesmo raciocínio de `useBiblioteca`: só pergunta quando há sessão — a rota
 * responde 401 para visitante, e perguntar antes de saber quem é garantiria
 * a resposta errada.
 */
export function useConquistas() {
  const sessao = useSessao();

  return useQuery<AchievementListResponse>({
    queryKey: CHAVE_DAS_CONQUISTAS,
    queryFn: () => apiFetch('/api/achievements', achievementListResponseSchema),
    enabled: sessao.estado === 'autenticado',
  });
}
