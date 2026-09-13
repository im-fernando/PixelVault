import { z } from 'zod';

/**
 * Corpo de `PATCH /api/auth/public-profile`.
 *
 * Um campo, sem meio-termo: `/u/:handle` está de todo aberto ou de todo
 * fechado para quem não tem sessão — não existe "visível só para quem já
 * segue" nem coisa parecida, porque a M6 nunca introduziu esse conceito de
 * relação entre contas.
 */
export const updatePublicProfileRequestSchema = z.object({
  enabled: z.boolean(),
});
export type UpdatePublicProfileRequest = z.infer<typeof updatePublicProfileRequestSchema>;
