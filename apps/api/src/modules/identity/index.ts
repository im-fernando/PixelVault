/**
 * Superfície pública do módulo `identity`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar identity/domain, identity/application ou identity/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * Login e sessão ainda não existem (nascem nas issues seguintes da M2): o
 * que o módulo entrega até aqui é o domínio rico exigido pela ADR 0005 e o
 * cadastro de conta.
 */
export { identityRoutes } from './http/routes.js';
export { Email } from './domain/email.js';
export { ErroDeIdentidade } from './domain/erros.js';
export { Handle } from './domain/handle.js';
export { validarPoliticaDeSenha } from './domain/politica-senha.js';
export { User } from './domain/user.js';
export type { PropsCriacaoUser } from './domain/user.js';
export type { UserRepository } from './domain/user-repository.js';
