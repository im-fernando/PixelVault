import { useQuery } from '@tanstack/react-query';
import { gameDetailSchema, type GameDetail } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * Detalhe do jogo, com a referência da ROM quando é homebrew.
 *
 * O player parte do slug e precisa chegar aos bytes. Quem resolve o caminho do
 * arquivo é a API, e não o front concatenando string: o dia em que o homebrew
 * sair de `apps/web/public` para um CDN, ninguém precisa procurar template de
 * URL espalhado pela tela.
 */
export function useGame(slug: string) {
  return useQuery<GameDetail>({
    queryKey: ['game', slug],
    queryFn: () => apiFetch(`/api/games/${encodeURIComponent(slug)}`, gameDetailSchema),
  });
}
