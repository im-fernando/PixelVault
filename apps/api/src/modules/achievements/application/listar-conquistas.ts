import type { AchievementListResponse } from '@pixelvault/contracts';
import { atualizarConquistasPorAgregacao } from './atualizar-conquistas-por-agregacao.js';
import type { DependenciasDaAtualizacaoPorAgregacao } from './atualizar-conquistas-por-agregacao.js';

export type DependenciasDaListagem = DependenciasDaAtualizacaoPorAgregacao;

/**
 * As conquistas da conta, prontas para `GET /api/achievements`.
 *
 * Atualiza a agregação antes de listar — é aqui que "sob demanda" (ver o
 * cabeçalho de `atualizar-conquistas-por-agregacao.ts`) se torna "a conta
 * nunca vê a própria lista atrasada": a chamada que lista é a mesma que
 * verifica, então não existe uma segunda visita em que a conquista "aparece
 * depois".
 */
export async function listarConquistas(
  deps: DependenciasDaListagem,
  userId: string,
): Promise<AchievementListResponse> {
  await atualizarConquistasPorAgregacao(deps, userId);

  const conquistas = await deps.conquistas.listar(userId);
  return {
    achievements: conquistas.map((conquista) => ({
      code: conquista.code,
      unlockedAt: conquista.unlockedAt.toISOString(),
    })),
  };
}
