import { z } from 'zod';
import { emailSchema } from './email.js';
import { handleSchema } from './handle.js';
import { senhaCandidataSchema } from './senha.js';

export const TAMANHO_MAXIMO_DISPLAY_NAME = 60;

/**
 * Corpo de `POST /api/auth/register`.
 *
 * `termsAccepted` é `z.literal(true)`, não `boolean`: a única forma de o
 * cadastro seguir é a pessoa ter aceitado os termos de verdade. Quando ela
 * aceitou é o servidor quem carimba — o cliente não manda timestamp, porque
 * consentimento datado pelo cliente não prova nada.
 *
 * `displayName` é opcional: sem ele, o servidor deriva do handle.
 */
export const registerRequestSchema = z.object({
  email: emailSchema,
  handle: handleSchema,
  password: senhaCandidataSchema,
  displayName: z.string().trim().min(1).max(TAMANHO_MAXIMO_DISPLAY_NAME).optional(),
  termsAccepted: z.literal(true),
});
export type RegisterRequest = z.infer<typeof registerRequestSchema>;

/**
 * Resposta do cadastro — deliberadamente sem nada que só exista quando o
 * INSERT aconteceu.
 *
 * Cadastro é uma das duas portas de enumeração de usuários (a outra é o
 * login): se o corpo devolvesse o `id` do usuário criado, a tentativa com
 * e-mail já cadastrado — que não cria nada — não teria id para devolver, e a
 * diferença entregaria a existência da conta. Por isso o corpo é uma
 * confirmação genérica, idêntica nos dois casos.
 */
export const registerResponseSchema = z.object({
  status: z.literal('cadastro-recebido'),
});
export type RegisterResponse = z.infer<typeof registerResponseSchema>;
