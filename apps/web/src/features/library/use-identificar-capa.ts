import { useMutation, useQueryClient } from '@tanstack/react-query';
import { identificarCapaResponseSchema, type IdentificarCapaResponse } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { CHAVE_DA_BIBLIOTECA } from './use-biblioteca.js';

/**
 * O botão "Identificar" da estante: a pessoa digita o nome exato do dump, e o
 * servidor tenta esse nome contra o provedor de capa (`POST
 * /api/games/:gameId/cover`) — cobre o caso que a busca automática não
 * cobre (região e idioma juntos no nome do arquivo, por exemplo).
 *
 * Invalida a biblioteca no sucesso: é a mesma consulta que `MinhaBiblioteca`
 * lê, e é ela quem precisa saber que aquele jogo ganhou capa.
 */
export function useIdentificarCapa() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      gameId,
      title,
    }: {
      readonly gameId: string;
      readonly title: string;
    }): Promise<IdentificarCapaResponse> =>
      apiFetch(`/api/games/${gameId}/cover`, identificarCapaResponseSchema, {
        method: 'POST',
        body: JSON.stringify({ title }),
      }),
    onSuccess: async (resultado) => {
      if (resultado.status === 'encontrada') {
        await queryClient.invalidateQueries({ queryKey: CHAVE_DA_BIBLIOTECA });
      }
    },
  });
}
