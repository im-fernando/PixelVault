/**
 * Superfície pública do módulo `catalog`.
 *
 * Este arquivo é a ÚNICA porta de entrada: nenhum outro módulo pode importar
 * catalog/domain, catalog/application ou catalog/infrastructure. A regra é
 * verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 */
export { catalogRoutes } from './http/routes.js';
export type { GameRepository } from './domain/game-repository.js';
