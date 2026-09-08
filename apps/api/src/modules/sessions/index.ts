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
 * `Sessoes` é a única coisa que atravessa a fronteira: o `identity` a usa
 * para abrir sessão no login e para derrubar as outras quando alguém troca de
 * senha, sem nunca saber o que é um token ou uma linha de `sessions`.
 */
export { criarSessoes } from './http/sessoes.js';
export type { OpcoesDeSessoes, Sessoes } from './http/sessoes.js';
export { sessionsRoutes } from './http/routes.js';
export type { OpcoesDeSessionsRoutes } from './http/routes.js';
export { NOME_DO_COOKIE_DE_SESSAO } from './http/cookie.js';
export { DURACAO_DA_SESSAO_MS } from './domain/sessao.js';
