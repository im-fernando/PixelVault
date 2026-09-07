import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { gameSchema, type Game } from '@pixelvault/contracts';
import { apiFetch } from '../../lib/api.js';

const listaDeJogos = z.array(gameSchema);

export function useGames() {
  return useQuery<Game[]>({
    queryKey: ['games'],
    queryFn: () => apiFetch('/api/games', listaDeJogos),
  });
}
