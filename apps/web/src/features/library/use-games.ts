import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { gameSchema, type Game } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

const listaDeJogos = z.array(gameSchema);

/**
 * O catálogo público da home (`Frontispicio` e `GameLibrary`, na rota `/`,
 * sem login) — e é por isso que `homebrewOnly=true` vai sempre na consulta.
 *
 * A ADR 0006 é explícita: "um catálogo público de homebrew convive junto,
 * jogável sem login". A rota `GET /api/games` não tem essa regra embutida —
 * ela aceita `homebrewOnly` como filtro do cliente, e devolve o catálogo
 * inteiro sem ele. Isso não doía enquanto `games` só tinha homebrew e um
 * punhado de jogo comercial cadastrado à mão; desde a importação do No-Intro
 * (issue #134), o catálogo tem milhares de jogos comerciais, e omitir o
 * filtro aqui encheria a home pública com a base inteira.
 */
export function useGames() {
  return useQuery<Game[]>({
    queryKey: ['games', 'homebrew'],
    queryFn: () => apiFetch('/api/games?homebrewOnly=true', listaDeJogos),
  });
}
