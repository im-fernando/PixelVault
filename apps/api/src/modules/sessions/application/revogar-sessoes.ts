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

/**
 * Derruba TODAS as sessões da conta. Devolve quantas caíram.
 *
 * Existe para um caso só, e é o que justifica ela não ter "sessão
 * preservada": a redefinição de senha pelo link do e-mail (#51). Ali não há
 * sessão atual a poupar — a pessoa não está logada, e é exatamente por não
 * conseguir entrar que ela chegou até aqui. Chamar `revogarOutrasSessoes`
 * com um id inventado daria o mesmo `DELETE` e seria mentira no nome.
 *
 * Recebe `userId` solto em vez de sair de uma requisição autenticada porque
 * quem autoriza esta operação não é um cookie: é o token de uso único que o
 * `identity` acabou de gastar. O módulo `sessions` continua sem saber o que
 * é uma senha — para ele, é uma string opaca pedindo que tudo caia.
 *
 * E é o comportamento que a pessoa espera: quem redefine a senha
 * desconfiando de invasão precisa que o invasor caia junto. Uma sessão
 * sobrevivente aqui manteria dentro exatamente quem se está tentando
 * expulsar.
 */
export async function revogarTodasAsSessoes(
  deps: DependenciasDeRevogacao,
  userId: string,
): Promise<number> {
  return deps.sessoes.revogarTodas(userId);
}
