import { z } from 'zod';
import { senhaCandidataSchema, TAMANHO_MAXIMO_SENHA } from './senha.js';

/**
 * Corpo de `POST /api/auth/change-password` — trocar a senha sabendo a atual,
 * já autenticado. Não confundir com recuperação de senha por e-mail (#51),
 * que é para quem justamente não sabe a senha e não está logado.
 *
 * `currentPassword` não usa `senhaCandidataSchema` pelo mesmo motivo que o
 * login não usa: a política vale para quem está escolhendo uma senha, não
 * para quem está digitando a que já tem. Se o mínimo subir de 12 para 14
 * caracteres amanhã, quem se cadastrou antes precisa continuar conseguindo
 * provar que sabe a senha antiga — para poder trocá-la.
 *
 * `newPassword`, essa sim, passa pela política inteira: é uma senha sendo
 * escolhida agora.
 */
export const changePasswordRequestSchema = z.object({
  currentPassword: z.string().min(1).max(TAMANHO_MAXIMO_SENHA),
  newPassword: senhaCandidataSchema,
});
export type ChangePasswordRequest = z.infer<typeof changePasswordRequestSchema>;

/**
 * Resposta da troca de senha.
 *
 * `revokedSessions` existe porque derrubar os outros dispositivos é metade do
 * que a pessoa espera ao trocar a senha desconfiando de invasão — e ela
 * merece ver que aconteceu. A sessão que fez a troca sobrevive de propósito:
 * deslogar quem acabou de provar que sabe a senha atual seria punir o
 * comportamento que queremos incentivar.
 */
export const changePasswordResponseSchema = z.object({
  status: z.literal('senha-alterada'),
  revokedSessions: z.number().int().nonnegative(),
});
export type ChangePasswordResponse = z.infer<typeof changePasswordResponseSchema>;
