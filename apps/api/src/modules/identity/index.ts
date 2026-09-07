/**
 * Superfície pública do módulo `identity`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar identity/domain, identity/application ou identity/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * Ainda não há rota HTTP nem persistência (nascem em issues futuras da M2):
 * o que existe até aqui é o domínio rico exigido pela ADR 0005 — value
 * objects, política de senha e a entidade `User`.
 */
export { Email } from './domain/email.js';
export { ErroDeIdentidade } from './domain/erros.js';
export { Handle } from './domain/handle.js';
export { validarPoliticaDeSenha } from './domain/politica-senha.js';
export { User } from './domain/user.js';
export type { PropsCriacaoUser } from './domain/user.js';
