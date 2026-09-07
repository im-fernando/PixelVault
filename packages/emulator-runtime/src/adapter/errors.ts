import type { SystemId } from '@pixelvault/contracts';
import type { CapabilityName, EmulatorCapabilities } from './capabilities.js';
import type { EmulatorStatus } from './status.js';

/**
 * Código estável de falha do runtime. A UI decide o que fazer a partir do
 * código, nunca da mensagem — mensagem é para humano e pode mudar. Mesmo
 * contrato dos erros da API (`apps/api/src/infrastructure/errors.ts`).
 */
export type EmulatorErrorCode =
  | 'ROM_INVALID'
  | 'CORE_LOAD_FAILED'
  | 'STATE_INCOMPATIBLE'
  | 'CAPABILITY_UNSUPPORTED'
  | 'INVALID_LIFECYCLE'
  | 'SYSTEM_UNSUPPORTED'
  | 'ADAPTER_ALREADY_REGISTERED';

/** Raiz de tudo que o runtime de emulação estoura. */
export class EmulatorError extends Error {
  constructor(
    readonly code: EmulatorErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'EmulatorError';
  }
}

/**
 * A ROM não pôde ser lida ou o core a recusou.
 *
 * Cobre os dois casos de propósito: da perspectiva de quem está jogando,
 * "arquivo corrompido" e "não consegui baixar o arquivo" terminam na mesma
 * tela. A causa técnica vai em `cause`.
 */
export class RomInvalidError extends EmulatorError {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super('ROM_INVALID', `ROM inválida: ${reason}`, options);
    this.name = 'RomInvalidError';
  }
}

/** O core não subiu: WASM que não baixou, WebGL indisponível, memória insuficiente. */
export class CoreLoadError extends EmulatorError {
  constructor(
    readonly systemId: SystemId,
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super('CORE_LOAD_FAILED', `falha ao carregar o core de ${systemId}: ${reason}`, options);
    this.name = 'CoreLoadError';
  }
}

/**
 * O save state existe, mas não serve para esta máquina.
 *
 * É o erro mais importante da sincronização de progresso: save state é
 * fotografia da memória de uma versão específica do core, e a pessoa que
 * atualizou o navegador precisa ser avisada em vez de ver a tela travar.
 */
export class StateIncompatibleError extends EmulatorError {
  constructor(
    readonly reason: string,
    options?: ErrorOptions,
  ) {
    super('STATE_INCOMPATIBLE', `save state incompatível: ${reason}`, options);
    this.name = 'StateIncompatibleError';
  }
}

/** Pediram algo que este core não faz. Se a UI lê `capabilities`, nunca acontece. */
export class CapabilityUnsupportedError extends EmulatorError {
  constructor(readonly capability: CapabilityName) {
    super('CAPABILITY_UNSUPPORTED', `este core não suporta "${capability}"`);
    this.name = 'CapabilityUnsupportedError';
  }
}

/** Operação fora de ordem: `start()` antes de `loadGame()`, uso depois de `destroy()`. */
export class EmulatorLifecycleError extends EmulatorError {
  constructor(
    readonly operation: string,
    readonly current: EmulatorStatus,
    readonly expected: readonly EmulatorStatus[],
  ) {
    super(
      'INVALID_LIFECYCLE',
      `${operation}() exige o adapter em ${expected.join(' ou ')}, mas ele está em ${current}`,
    );
    this.name = 'EmulatorLifecycleError';
  }
}

/** Nenhum adapter registrado para o console pedido. */
export class SystemUnsupportedError extends EmulatorError {
  constructor(
    readonly systemId: SystemId,
    reason = 'nenhum adapter registrado',
  ) {
    super('SYSTEM_UNSUPPORTED', `console "${systemId}" não suportado: ${reason}`);
    this.name = 'SystemUnsupportedError';
  }
}

/** Dois adapters disputando o mesmo console — quase sempre registro duplicado por engano. */
export class AdapterAlreadyRegisteredError extends EmulatorError {
  constructor(readonly systemId: SystemId) {
    super('ADAPTER_ALREADY_REGISTERED', `já existe um adapter registrado para "${systemId}"`);
    this.name = 'AdapterAlreadyRegisteredError';
  }
}

export function isEmulatorError(value: unknown): value is EmulatorError {
  return value instanceof EmulatorError;
}

/**
 * Guarda de capacidade. Mora junto do erro que levanta.
 *
 * O adapter chama isto na entrada de cada operação opcional: mesmo com a UI
 * lendo `capabilities`, chamada programática (atalho de teclado, sincronização
 * automática) precisa falhar com código, não com `undefined` mais adiante.
 */
export function requireCapability(
  capabilities: EmulatorCapabilities,
  capability: CapabilityName,
): void {
  if (!capabilities[capability]) {
    throw new CapabilityUnsupportedError(capability);
  }
}
