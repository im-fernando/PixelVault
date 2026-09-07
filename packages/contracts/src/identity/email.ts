import { z } from 'zod';

/**
 * Formato aceito na borda. A normalização (minúsculas, trim) e a comparação
 * case-insensitive são responsabilidade do value object `Email` em
 * `apps/api/src/modules/identity/domain` — aqui só se recusa lixo óbvio.
 */
export const emailSchema = z.email().max(254);
export type EmailInput = z.infer<typeof emailSchema>;
