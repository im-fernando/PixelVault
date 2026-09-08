import { UnauthenticatedError } from '../../../infrastructure/errors.js';
import type { DadosDoUsuario, UserRepository } from '../domain/user-repository.js';

/**
 * O usuário por trás de uma sessão válida — o que `GET /api/auth/me`
 * devolve.
 *
 * Recebe o `userId` já resolvido pelo módulo `sessions`: este caso de uso
 * não sabe o que é cookie nem token. Se o `identity` fosse quem lê a
 * sessão, cada módulo futuro que precisar do usuário logado teria que
 * depender de `identity` só para isso.
 *
 * Sessão válida apontando para usuário inexistente não deveria acontecer
 * (a FK apaga as sessões junto com a conta), mas se acontecer é 401 e não
 * 500: do ponto de vista de quem chamou, a sessão simplesmente não vale
 * mais. `/me` nunca responde 500 por falta de usuário ou de sessão.
 */
export async function buscarUsuarioAutenticado(
  usuarios: UserRepository,
  userId: string,
): Promise<DadosDoUsuario> {
  const usuario = await usuarios.buscarPorId(userId);
  if (usuario === null) throw new UnauthenticatedError();
  return usuario;
}
