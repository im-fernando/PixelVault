import { UnauthenticatedError } from '../../../infrastructure/errors.js';
import type { DadosDoUsuario, UserRepository } from '../domain/user-repository.js';

export interface DependenciasDaVisibilidadeDoPerfil {
  usuarios: UserRepository;
}

/**
 * Liga ou desliga `/u/:handle` da própria conta — o oposto do que a #123
 * decidiu na época ("perfil não tem modo privado"): agora tem, e quem decide
 * é a própria pessoa, na tela de conta.
 *
 * Sem validação de posse: `userId` vem da sessão, e não existe parâmetro que
 * aponte para a conta de outra pessoa.
 */
export async function definirVisibilidadeDoPerfil(
  deps: DependenciasDaVisibilidadeDoPerfil,
  userId: string,
  ativo: boolean,
): Promise<DadosDoUsuario> {
  await deps.usuarios.definirPerfilPublico(userId, ativo);

  const usuario = await deps.usuarios.buscarPorId(userId);
  // Sessão válida apontando para conta que acabou de ser apagada não deveria
  // acontecer — mas se acontecer, 401 e não 500, o mesmo raciocínio de
  // `trocar-senha.ts`.
  if (usuario === null) throw new UnauthenticatedError();
  return usuario;
}
