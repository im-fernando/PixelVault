import { useQuery } from '@tanstack/react-query';
import { buscarCapasCandidatasResponseSchema, type CapaCandidata } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

/**
 * A lista que alimenta o "Identificar capa" enquanto a pessoa digita.
 *
 * Só sai quando o termo tem 2 caracteres ou mais — pedir com menos gastaria
 * a chamada (que na primeira vez de cada console baixa a árvore inteira do
 * GitHub) para uma lista de centenas de resultados que não ajuda ninguém a
 * escolher. O mesmo mínimo que o servidor exige em `buscarCapasCandidatasQuerySchema`
 * — repetido aqui para não disparar a requisição que o servidor recusaria.
 */
export function useBuscarCapasCandidatas(gameId: string, termo: string) {
  const termoValido = termo.trim().length >= 2;

  return useQuery<readonly CapaCandidata[]>({
    queryKey: ['capas-candidatas', gameId, termo.trim().toLowerCase()],
    queryFn: async () => {
      const resposta = await apiFetch(
        `/api/games/${gameId}/cover/search?q=${encodeURIComponent(termo.trim())}`,
        buscarCapasCandidatasResponseSchema,
      );
      return resposta.candidatas;
    },
    enabled: termoValido,
  });
}
