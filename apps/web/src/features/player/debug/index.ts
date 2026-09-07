/**
 * Superfície pública do diagnóstico de performance (issue #26).
 *
 * O player conhece três coisas daqui — o atalho, o hook e o painel — e nada
 * mais. Trocar a matemática do pacing, a sonda de áudio ou o desenho do gráfico
 * não deveria abrir o `EmulatorPlayer`.
 */
export { ATALHO_DE_DIAGNOSTICO, NOME_DO_ATALHO } from './diagnostics-flag.js';
export { DiagnosticsOverlay } from './DiagnosticsOverlay.js';
export { useDiagnostico, type AmostraDeDiagnostico, type Diagnostico } from './use-diagnostics.js';
