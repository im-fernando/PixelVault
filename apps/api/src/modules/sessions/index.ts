/**
 * Superfície pública do módulo `sessions`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar sessions/domain, sessions/application ou sessions/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono do ciclo de vida da sessão e de mais nada: cria, resolve e
 * desliza. Para ele, um usuário é uma string opaca — não existe `User`,
 * e-mail ou senha aqui dentro. É essa ignorância que deixa `identity`,
 * `library` e `progress` compartilharem a mesma resolução de sessão sem
 * nenhum deles depender do outro.
 *
 * Revogar, listar e encerrar sessão são da issue #47.
 */
export { criarSessoes } from './http/sessoes.js';
export type { OpcoesDeSessoes, Sessoes } from './http/sessoes.js';
export { NOME_DO_COOKIE_DE_SESSAO } from './http/cookie.js';
export { DURACAO_DA_SESSAO_MS } from './domain/sessao.js';
