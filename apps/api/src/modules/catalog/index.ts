/**
 * Superfície pública do módulo `catalog`.
 *
 * Este arquivo é a ÚNICA porta de entrada: nenhum outro módulo pode importar
 * catalog/domain, catalog/application ou catalog/infrastructure. A regra é
 * verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O catálogo é dono dos hashes conhecidos (`game_roms`), e é por isso que o
 * match do BYOR sai daqui: quando o `library` verifica uma ROM enviada, ele
 * pergunta `identificarRomPorHash` em vez de consultar a tabela de outro
 * módulo por conta própria.
 *
 * É dono também do título e da capa, e é por isso que a estante da biblioteca
 * pessoal (#75) pergunta `descreverJogos` em vez de fazer uma junção com
 * `games`. As duas funções são o mesmo desenho: a biblioteca conhece uma
 * função, e não uma tabela.
 */
export { catalogRoutes } from './http/routes.js';
export { descreverJogos } from './application/descrever-jogos.js';
export { identificarRomPorHash } from './application/identificar-rom.js';
export type { FichaDeJogo, GameRepository, RomDoCatalogo } from './domain/game-repository.js';
