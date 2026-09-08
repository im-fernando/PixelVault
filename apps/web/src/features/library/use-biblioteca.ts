import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  libraryRomListSchema,
  romFavoriteResponseSchema,
  romRemovedResponseSchema,
  type LibraryRom,
} from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';
import { useSessao } from '../auth/sessao.js';

/**
 * A biblioteca pessoal, do lado do front.
 *
 * A chave é exportada porque toda mutação daqui a invalida — favoritar muda a
 * ordem da estante, remover tira um cartucho dela, e as duas coisas só existem
 * de verdade depois que o servidor confirma.
 */
export const CHAVE_DA_BIBLIOTECA = ['biblioteca'] as const;

/**
 * As ROMs de quem está logado.
 *
 * A consulta só sai quando há sessão, e isso não é otimização: `GET
 * /api/library/roms` responde 401 para visitante, e disparar a chamada mesmo
 * assim encheria o console de erro em toda visita anônima à home. Enquanto a
 * sessão está `carregando`, também não: perguntar antes de saber quem é
 * garantiria a resposta errada.
 */
export function useBiblioteca() {
  const sessao = useSessao();

  return useQuery<LibraryRom[]>({
    queryKey: CHAVE_DA_BIBLIOTECA,
    queryFn: () => apiFetch('/api/library/roms', libraryRomListSchema),
    enabled: sessao.estado === 'autenticado',
  });
}

/**
 * Favoritar e desfavoritar, sem otimismo.
 *
 * A tela espera a resposta e recarrega a lista em vez de virar o cartucho na
 * hora. São dois motivos, e o segundo é o que decide: favoritar **reordena a
 * estante** (favorito vem primeiro, e a ordem sai do banco), então um otimismo
 * aqui teria que reordenar também — e desfazer a reordenação no erro. Fingir
 * um estado que muda a posição das coisas é como a interface aprende a mentir.
 */
export function useFavoritarRom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ romId, favorito }: { romId: string; favorito: boolean }) =>
      apiFetch(
        `/api/library/roms/${encodeURIComponent(romId)}/favorite`,
        romFavoriteResponseSchema,
        { method: favorito ? 'PUT' : 'DELETE' },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_DA_BIBLIOTECA });
    },
  });
}

/**
 * Remover uma ROM da biblioteca.
 *
 * O que o servidor faz com o objeto no storage — coletar ou não, conforme
 * outra pessoa tenha o mesmo conteúdo — não chega aqui, e não deveria: a
 * resposta contaria que alguém mais tem aquele arquivo (docs/adr/0013). Para
 * quem clicou, o que aconteceu é uma coisa só: saiu da estante.
 */
export function useRemoverRom() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (romId: string) =>
      apiFetch(`/api/library/roms/${encodeURIComponent(romId)}`, romRemovedResponseSchema, {
        method: 'DELETE',
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: CHAVE_DA_BIBLIOTECA });
    },
  });
}
