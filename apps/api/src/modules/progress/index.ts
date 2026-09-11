/**
 * Superfície pública do módulo `progress`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar progress/domain, progress/application ou progress/infrastructure.
 * A regra é verificada no CI pelo dependency-cruiser. Ver docs/adr/0003.
 *
 * O módulo é dono do save na conta na nuvem — SRAM desde a M4, save state
 * desde a M5. A #88 trouxe a tabela e a porta de leitura; a #89 trouxe a
 * gravação de SRAM (`POST /progress/sram/:romId`, condicionada por revisão
 * do ADR 0020); a #90 trouxe a leitura (`GET /progress/sram/:romId`). A #104
 * estendeu o schema para save state (eixo `slot`, miniatura); a #105 trouxe
 * a gravação por slot (`POST /progress/state/:romId/:slot`); a #106 trouxe a
 * listagem dos 4 slots (`GET /progress/state/:romId`) e a leitura de um slot
 * (`GET /progress/state/:romId/:slot`). Ele não é dono da sessão (pede ao
 * `sessions`), da autorização (pergunta ao `identity`), do storage (porta
 * compartilhada da aplicação) nem da ROM em si (pergunta ao `library` se
 * aquele `romId` é de quem está pedindo, pela fachada dele).
 *
 * `agregadoDeJogoDoUsuario` sai daqui desde a #120: `achievements` pergunta
 * jogos distintos e horas jogadas para as conquistas de agregação (ADR
 * 0010), pela composition root — mesmo raciocínio de
 * `contarRomsNaBiblioteca` em `library`, para não fechar ciclo com o aviso
 * de evento que este módulo já faz na direção contrária.
 */
export { progressRoutes } from './http/routes.js';
export type { OpcoesDeProgress } from './http/routes.js';
export type { SaveNaNuvem, TipoDeSaveNaNuvem } from './domain/user-save.js';
export type { UserSaveRepository } from './domain/user-save-repository.js';
export type {
  AvisarPrimeiraSincronizacao,
  AvisarPrimeiroSaveState,
} from './domain/eventos-de-gamificacao.js';
export type { AgregadoDeJogoDoUsuario } from './domain/agregado-de-jogo.js';
export { agregadoDeJogoDoUsuario } from './application/agregado-de-jogo-do-usuario.js';
