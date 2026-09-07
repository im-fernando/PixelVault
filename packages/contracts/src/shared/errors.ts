import { z } from 'zod';

/**
 * Códigos de erro estáveis. O cliente decide o que fazer a partir do código,
 * nunca a partir da mensagem — mensagem é para humano e pode mudar.
 */
export const errorCodeSchema = z.enum([
  'VALIDATION_FAILED',
  'UNAUTHENTICATED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof errorCodeSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  /** Erros por campo, quando a falha for de validação. */
  details: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
