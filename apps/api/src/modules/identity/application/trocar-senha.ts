import type { ChangePasswordRequest } from '@pixelvault/contracts';
import { UnauthenticatedError } from '../../../infrastructure/errors.js';
import { ErroDeIdentidade } from '../domain/erros.js';
import { validarPoliticaDeSenha } from '../domain/politica-senha.js';
import type { UserRepository } from '../domain/user-repository.js';
import { comErrosTraduzidos } from './traduzir-erro.js';

export interface DependenciasDaTrocaDeSenha {
  usuarios: UserRepository;
  /** `verificarSenha` do Argon2id — o caso de uso só sabe que compara. */
  verificar: (senhaPlana: string, hash: string) => Promise<boolean>;
  gerarHash: (senhaPlana: string) => Promise<string>;
}

/**
 * Troca de senha de quem está logado e sabe a senha atual.
 *
 * Não confundir com recuperação de senha por e-mail (#51): lá a pessoa não
 * sabe a senha e não está logada, e a prova de identidade é o link no e-mail.
 * Aqui a prova são duas, e as duas são exigidas — o cookie de sessão e a
 * senha atual. Exigir só o cookie transformaria qualquer XSS ou máquina
 * destravada num sequestro permanente da conta: bastaria trocar a senha.
 *
 * A política de senha é aplicada sobre a senha nova, nunca sobre a atual —
 * quem se cadastrou quando o mínimo era menor precisa continuar conseguindo
 * provar que sabe a senha antiga para poder trocá-la.
 *
 * Chamamos `validarPoliticaDeSenha` direto em vez de `User.trocarSenha`
 * porque não existe caminho de reidratação de `User` a partir do banco neste
 * módulo (o cadastro cria a entidade, nunca a recarrega). Construir um só
 * para chamar um método que faz exatamente esta validação seria cerimônia,
 * não invariante — e a invariante que interessa (senha nova passa pela
 * política antes de virar hash) está garantida do mesmo jeito.
 *
 * Derrubar as outras sessões não acontece aqui: é do módulo `sessions`, e
 * quem costura os dois é a rota. Ver `http/routes.ts`.
 */
export async function trocarSenha(
  deps: DependenciasDaTrocaDeSenha,
  userId: string,
  entrada: ChangePasswordRequest,
): Promise<void> {
  await comErrosTraduzidos(async () => {
    const credenciais = await deps.usuarios.buscarCredenciaisPorId(userId);
    // Sessão válida apontando para usuário inexistente não deveria acontecer
    // (a FK apaga as sessões junto com a conta). Se acontecer, é 401 e não
    // 500 — do ponto de vista de quem chamou, a sessão não vale mais.
    if (credenciais === null) throw new UnauthenticatedError();

    if (!(await deps.verificar(entrada.currentPassword, credenciais.senhaHash))) {
      throw new ErroDeIdentidade('SENHA_ATUAL_INCORRETA', 'Senha atual incorreta');
    }

    validarPoliticaDeSenha(entrada.newPassword);

    // Sem reidratação do Argon2id: o hash está sendo substituído por um
    // calculado agora, com os parâmetros atuais, então não há o que migrar.
    await deps.usuarios.regravarSenhaHash(userId, await deps.gerarHash(entrada.newPassword));
  });
}
