/**
 * Superfície pública do módulo `identity`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar identity/domain, identity/application ou identity/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono das credenciais: cadastro, login e "quem sou eu". O ciclo
 * de vida da sessão é do módulo `sessions` — aqui só se pede a ele que abra
 * uma, passando um `userId`. Logout e revogação são a issue #47.
 */
export { identityRoutes } from './http/routes.js';
export type { OpcoesDeIdentity } from './http/routes.js';
export { Email } from './domain/email.js';
export { ErroDeIdentidade } from './domain/erros.js';
export { Handle } from './domain/handle.js';
export { validarPoliticaDeSenha } from './domain/politica-senha.js';
export { User } from './domain/user.js';
export type { PropsCriacaoUser } from './domain/user.js';
export type { UserRepository } from './domain/user-repository.js';
