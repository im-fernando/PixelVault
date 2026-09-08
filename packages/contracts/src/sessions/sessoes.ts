import { z } from 'zod';
import { uuidSchema } from '../shared/primitives.js';

/**
 * Uma sessão como o dono dela a vê na tela "onde estou logado".
 *
 * Repare no que não está aqui, e nunca vai estar: o token e o hash do token.
 * O token existe em dois lugares só — no cookie do navegador daquele
 * dispositivo e, hasheado, na coluna `token_hash`. Se ele aparecesse nesta
 * listagem, qualquer sessão viva viraria uma forma de sequestrar todas as
 * outras da mesma conta.
 *
 * `userAgent` e `ipTruncated` são o "dispositivo aproximado": o suficiente
 * para a pessoa reconhecer qual linha é o celular dela e qual não é. O IP já
 * chega truncado desde a abertura da sessão (IPv4 /24, IPv6 /48) — a
 * finalidade é reconhecimento e localização grosseira em caso de abuso, não
 * rastreio. Ver docs/adr/0017 e docs/seguranca.md.
 */
export const sessionSummarySchema = z.object({
  id: uuidSchema,
  userAgent: z.string().nullable(),
  ipTruncated: z.string().nullable(),
  createdAt: z.iso.datetime(),
  lastSeenAt: z.iso.datetime(),
  /** Se esta é a sessão que fez a requisição. Só uma linha pode ser `true`. */
  current: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;

export const sessionListResponseSchema = z.object({
  sessions: z.array(sessionSummarySchema),
});
export type SessionListResponse = z.infer<typeof sessionListResponseSchema>;

/**
 * Resposta do logout. É sempre esta, com status 200, inclusive para quem
 * chamou sem sessão nenhuma — ver `sessions/http/routes.ts`.
 */
export const logoutResponseSchema = z.object({
  status: z.literal('sessao-encerrada'),
});
export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

export const revokeSessionResponseSchema = z.object({
  status: z.literal('sessao-revogada'),
});
export type RevokeSessionResponse = z.infer<typeof revokeSessionResponseSchema>;

export const revokeOtherSessionsResponseSchema = z.object({
  status: z.literal('sessoes-revogadas'),
  /** Quantas caíram. É contagem das sessões da própria pessoa, não vaza nada. */
  revoked: z.number().int().nonnegative(),
});
export type RevokeOtherSessionsResponse = z.infer<typeof revokeOtherSessionsResponseSchema>;
