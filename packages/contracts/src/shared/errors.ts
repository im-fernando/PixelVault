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

/**
 * Qual dos dois eixos de rate limit recusou a requisição, em
 * `details.rateLimit` de um `RATE_LIMITED`.
 *
 * Não virou um `ErrorCode` novo de propósito. O código é o que o cliente usa
 * para decidir o que fazer, e a decisão é a mesma nos dois casos: esperar o
 * que o `retry-after` mandar e tentar de novo. O que muda é o que a pessoa
 * precisa entender ("a rede daqui está estourando o limite" x "esta conta
 * está sob tentativa demais agora"), e isso é mensagem, não fluxo. Um código
 * a mais no enum obrigaria todo cliente a tratar dois ramos que fazem a
 * mesma coisa.
 *
 * Também não vaza nada: o limite por identificador conta o e-mail tentado
 * exista ele ou não, então saber que ele estourou não diz se a conta existe.
 */
export const motivoDeLimiteSchema = z.enum(['LIMITE_POR_IP', 'LIMITE_POR_IDENTIFICADOR']);
export type MotivoDeLimite = z.infer<typeof motivoDeLimiteSchema>;

export const apiErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  /** Erros por campo, quando a falha for de validação. */
  details: z.record(z.string(), z.array(z.string())).optional(),
  requestId: z.string().optional(),
});
export type ApiError = z.infer<typeof apiErrorSchema>;
