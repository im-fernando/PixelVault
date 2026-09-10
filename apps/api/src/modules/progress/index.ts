/**
 * Superfície pública do módulo `progress`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar progress/domain, progress/application ou progress/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono do save na conta na nuvem — hoje só SRAM (M4); save state
 * chega na M5. A #88 trouxe a tabela e a leitura; a #89 traz a primeira rota
 * (`POST /progress/sram/:romId`, com a gravação condicionada por revisão do
 * ADR 0020). Ele não é dono da sessão (pede ao `sessions`), da autorização
 * (pergunta ao `identity`), do storage (porta compartilhada da aplicação) nem
 * da ROM em si (pergunta ao `library` se aquele `romId` é de quem está
 * pedindo, pela fachada dele).
 */
export { progressRoutes } from './http/routes.js';
export type { OpcoesDeProgress } from './http/routes.js';
export type { SaveNaNuvem, TipoDeSaveNaNuvem } from './domain/user-save.js';
export type { UserSaveRepository } from './domain/user-save-repository.js';
