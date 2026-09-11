import { z } from 'zod';
import { unlockedAchievementSchema } from '../achievements/conquistas.js';

/**
 * O perfil público da M6 (issue #123) — `GET /api/profiles/:handle`, sem
 * exigir sessão para ver o perfil de outra pessoa (é a "camada social" que
 * o ADR 0006 menciona como razão de existir o `game_id` canônico).
 *
 * O que sai daqui é deliberadamente pouco: nome de exibição, conquistas
 * desbloqueadas e estatística agregada (tempo jogado e jogos distintos).
 * Nunca a lista de ROMs — a biblioteca de alguém é privada (BYOR, ADR 0006),
 * e conquista/estatística é metadado agregado, não o acervo em si. Nunca o
 * e-mail, pelo mesmo raciocínio de `PerfilPublico` em `identity`.
 *
 * **Sem posição de ranking.** O ranking da #122 é POR JOGO (ver o cabeçalho
 * de `apps/api/src/modules/leaderboards/index.ts`) — não existe "posição
 * geral" de uma conta fora do contexto de um jogo específico, então o perfil
 * não tenta sintetizar uma. Quem quiser a posição de alguém num jogo
 * específico já tem `GET /api/leaderboards/games/:gameId` para isso.
 */
export const publicProfileResponseSchema = z.object({
  handle: z.string(),
  displayName: z.string(),
  achievements: z.array(unlockedAchievementSchema),
  /** Soma de `UserGame.totalPlaytimeSeconds` — mesmo número que alimenta o ranking. */
  totalPlaytimeSeconds: z.number().int().nonnegative(),
  /** Quantos jogos distintos a conta já jogou — linhas de `user_games`. */
  distinctGamesCount: z.number().int().nonnegative(),
});
export type PublicProfileResponse = z.infer<typeof publicProfileResponseSchema>;
