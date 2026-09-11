import type {
  ConquistaDesbloqueada,
  ObterAgregadoDeJogo,
  ObterConquistasDoUsuario,
  ObterPerfilPorHandle,
} from '../domain/portas.js';

export interface DependenciasDoPerfilPublico {
  obterPerfilPorHandle: ObterPerfilPorHandle;
  obterConquistas: ObterConquistasDoUsuario;
  obterAgregado: ObterAgregadoDeJogo;
}

/** O perfil público, pronto para `GET /api/profiles/:handle` — `null` quando o handle não existe. */
export interface PerfilPublicoResultado {
  handle: string;
  displayName: string;
  achievements: ConquistaDesbloqueada[];
  totalPlaytimeSeconds: number;
  distinctGamesCount: number;
}

/**
 * O perfil público de uma conta — issue #123.
 *
 * PERGUNTA a `identity` (quem é), `achievements` (o que já desbloqueou) e
 * `progress` (quanto jogou), e junta as três respostas. Nenhum dos três sabe
 * montar isto sozinho — é por isso que `profiles` existe como módulo à
 * parte, do mesmo jeito que `leaderboards` existe para juntar `progress` e
 * `identity`.
 *
 * Sem posição de ranking: a #122 decidiu ranking POR JOGO, não geral da
 * conta (ver o cabeçalho de `modules/leaderboards/index.ts`) — não existe
 * "a posição desta pessoa" fora do contexto de um jogo específico, então o
 * perfil não tenta sintetizar uma.
 *
 * `null` quando o handle não corresponde a conta nenhuma — quem chama (a
 * rota HTTP) decide o que isso vira (404).
 */
export async function obterPerfilPublico(
  deps: DependenciasDoPerfilPublico,
  handle: string,
): Promise<PerfilPublicoResultado | null> {
  const perfil = await deps.obterPerfilPorHandle(handle);
  if (perfil === null) return null;

  const [conquistas, agregado] = await Promise.all([
    deps.obterConquistas(perfil.userId),
    deps.obterAgregado(perfil.userId),
  ]);

  return {
    handle: perfil.handle,
    displayName: perfil.displayName,
    achievements: conquistas,
    totalPlaytimeSeconds: agregado.segundosJogados,
    distinctGamesCount: agregado.jogosDistintos,
  };
}
