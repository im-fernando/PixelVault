import { z } from 'zod';
import { uuidSchema } from '../shared/primitives.js';
import { TAMANHO_MAXIMO_DISPLAY_NAME } from './cadastro.js';
import { emailSchema } from './email.js';
import { handleSchema } from './handle.js';
import { TAMANHO_MAXIMO_SENHA } from './senha.js';

/**
 * Corpo de `POST /api/auth/login`.
 *
 * `password` NÃO usa `senhaCandidataSchema`. A política de senha vale para
 * quem está escolhendo uma senha, não para quem está digitando a que já tem:
 * se o mínimo subir de 12 para 14 caracteres amanhã, quem se cadastrou antes
 * continua conseguindo entrar. Recusar aqui por tamanho também abriria um
 * caminho de resposta mais rápido (400 sem tocar no Argon2), e é justamente
 * a uniformidade de tempo que este endpoint precisa preservar — o único
 * limite mantido é o máximo, que existe para não aceitar corpo gigante.
 */
export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(TAMANHO_MAXIMO_SENHA),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

/**
 * O usuário como o próprio dono dele o vê. Nunca carrega hash de senha nem
 * nada derivado dele — é o mesmo objeto devolvido pelo login e pelo `/me`,
 * de propósito: o front guarda uma forma só de "quem está logado".
 */
export const authenticatedUserSchema = z.object({
  id: uuidSchema,
  email: emailSchema,
  handle: handleSchema,
  displayName: z.string().min(1).max(TAMANHO_MAXIMO_DISPLAY_NAME),
});
export type AuthenticatedUser = z.infer<typeof authenticatedUserSchema>;

/**
 * Resposta do login e do `/me`. O token de sessão não aparece aqui e nunca
 * vai aparecer: ele viaja só no cookie `httpOnly`, que JavaScript não lê.
 * Ver docs/adr/0017.
 */
export const authenticatedUserResponseSchema = z.object({
  user: authenticatedUserSchema,
});
export type AuthenticatedUserResponse = z.infer<typeof authenticatedUserResponseSchema>;
