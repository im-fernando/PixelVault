import { useQuery } from '@tanstack/react-query';
import { publicProfileResponseSchema, type PublicProfileResponse } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * O perfil público de uma conta — issue #123.
 *
 * Diferente de `useConquistas` e `useRankingDoJogo`, esta consulta NÃO checa
 * sessão: `GET /api/profiles/:handle` responde 200 para qualquer visitante,
 * porque é exatamente esse o ponto da rota ("ver o perfil de outra pessoa
 * sem estar logado"). `enabled` só existe para não perguntar com um handle
 * vazio.
 */
export function usePerfilPublico(handle: string) {
  return useQuery<PublicProfileResponse>({
    queryKey: ['perfil-publico', handle],
    queryFn: () =>
      apiFetch(`/api/profiles/${encodeURIComponent(handle)}`, publicProfileResponseSchema),
    enabled: handle.length > 0,
  });
}
