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
 */
export { catalogRoutes } from './http/routes.js';
export { identificarRomPorHash } from './application/identificar-rom.js';
export type { GameRepository, RomDoCatalogo } from './domain/game-repository.js';
