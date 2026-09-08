import type { SessionRepository } from '../domain/session-repository.js';

export interface DependenciasDeRevogacao {
  sessoes: SessionRepository;
}

/**
 * Encerra uma sessão do usuário. `false` quando não havia o que encerrar.
 *
 * O `userId` viaja junto com o `id` até o `WHERE` do banco — este caso de uso
 * não lê a sessão para conferir o dono e depois decidir. A diferença importa:
 * quem lê antes tem em mãos a informação "existe, mas é de outro", e mais
 * cedo ou mais tarde alguém a transforma num 403. Aqui ela nunca chega a
 * existir, então a rota só pode responder a mesma coisa nos dois casos.
 *
 * Serve tanto ao logout (a sessão a encerrar é a atual) quanto ao
 * `DELETE /api/auth/sessions/:id` — é a mesma operação, muda só quem escolhe
 * o id.
 */
export async function revogarSessao(
  deps: DependenciasDeRevogacao,
  userId: string,
  sessaoId: string,
): Promise<boolean> {
  return deps.sessoes.revogar(sessaoId, userId);
}

/**
 * "Sair de todos os outros aparelhos": derruba tudo menos a sessão que pediu.
 *
 * Preservar a atual não é conveniência de implementação, é o comportamento
 * que a pessoa espera — quem clica nisso está no dispositivo em que confia e
 * quer expulsar os outros, não se autodeslogar. É a mesma operação que a
 * troca de senha dispara.
 *
 * `sessaoPreservada` é obrigatória de propósito: sem uma sessão atual não
 * existe "as outras", e aceitar um id nulo aqui transformaria silenciosamente
 * a operação num "derrubar todas".
 */
export async function revogarOutrasSessoes(
  deps: DependenciasDeRevogacao,
  userId: string,
  sessaoPreservada: string,
): Promise<number> {
  return deps.sessoes.revogarOutras(userId, sessaoPreservada);
}
