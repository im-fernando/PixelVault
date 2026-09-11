import { z } from 'zod';
import { uuidSchema } from '../shared/primitives.js';

/**
 * O ranking da M6 (issue #122) — decisões documentadas em
 * `apps/api/src/modules/leaderboards/index.ts`, com o raciocínio completo.
 * Resumo:
 *
 * - **Por jogo, não geral da conta**: BYOR (ADR 0006) só garante "o mesmo
 *   jogo" entre duas contas quando o catálogo reconhece o hash; somar
 *   playtime de jogos diferentes entre pessoas não seria uma comparação
 *   honesta.
 * - **Total histórico, sem temporada**: nenhuma infraestrutura de corte
 *   temporal existe hoje (nem cron — ADR 0019 recusou até Redis), e a #122
 *   não abre essa peça sem alguém ter pedido.
 * - **XP fica fora**: não é escopo desta issue — só playtime, que já é o que
 *   `UserGame.totalPlaytimeSeconds` mede desde a #119.
 */

/** Uma linha do ranking, com o que a interface precisa para desenhar. */
export const leaderboardEntrySchema = z.object({
  userId: uuidSchema,
  /** Nunca o e-mail — o mesmo handle que a M6 planeja tornar público em `/u/:handle` (#123). */
  handle: z.string(),
  displayName: z.string(),
  totalPlaytimeSeconds: z.number().int().nonnegative(),
  /** 1-based, estilo `RANK()` do SQL — contas empatadas compartilham a posição. */
  rank: z.number().int().positive(),
});
export type LeaderboardEntry = z.infer<typeof leaderboardEntrySchema>;

/** Resposta de `GET /api/leaderboards/games/:gameId`. */
export const leaderboardResponseSchema = z.object({
  gameId: uuidSchema,
  /** As `limit` primeiras posições do ranking daquele jogo. */
  top: z.array(leaderboardEntrySchema),
  /**
   * A posição da própria conta nesse ranking — presente mesmo quando ela cai
   * fora do `top` acima (é o critério de aceite da #122). `null` quando a
   * conta nunca creditou playtime nesse jogo (sem heartbeat aceito ainda,
   * ver ADR 0009): não existe posição para quem não está no ranking.
   */
  me: leaderboardEntrySchema.nullable(),
});
export type LeaderboardResponse = z.infer<typeof leaderboardResponseSchema>;

/** `?limit=` de `GET /api/leaderboards/games/:gameId` — tamanho do `top` pedido. */
export const leaderboardQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type LeaderboardQuery = z.infer<typeof leaderboardQuerySchema>;
