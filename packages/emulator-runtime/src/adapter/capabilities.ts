/**
 * O que este core consegue fazer. A UI **lê** daqui para decidir o que
 * desenhar: sem save state suportado, o botão não aparece.
 *
 * Todos os campos são obrigatórios de propósito. `capabilities` opcional vira
 * `?? true` otimista no consumidor, e `?? true` otimista vira botão de save
 * state que não faz nada num console que não suporta — o usuário só descobre
 * quando perde progresso. Quem escreve um adapter é obrigado a responder sim
 * ou não para cada item.
 */
export interface EmulatorCapabilities {
  /** Fotografia da máquina inteira: `exportState` e `importState`. */
  readonly saveState: boolean;
  /** Save que o próprio jogo escreve na bateria do cartucho. */
  readonly sram: boolean;
  /** Voltar no tempo alguns segundos sem save state explícito. */
  readonly rewind: boolean;
  /** Ler endereços da RAM do console — pré-requisito de conquista por evento de jogo. */
  readonly memoryRead: boolean;
  readonly cheats: boolean;
  readonly netplay: boolean;
}

export type CapabilityName = keyof EmulatorCapabilities;

/**
 * Nenhuma capacidade. É o ponto de partida de todo adapter: você declara o que
 * o core faz, nunca o que ele deixa de fazer.
 */
export const NO_CAPABILITIES: EmulatorCapabilities = Object.freeze({
  saveState: false,
  sram: false,
  rewind: false,
  memoryRead: false,
  cheats: false,
  netplay: false,
});

/**
 * Monta as capacidades a partir do que é suportado, com o resto em `false`.
 *
 * O default seguro é não suportar: um campo esquecido vira botão ausente, e
 * não botão quebrado.
 */
export function defineCapabilities(supported: Partial<EmulatorCapabilities>): EmulatorCapabilities {
  return { ...NO_CAPABILITIES, ...supported };
}

/** Predicado puro, para a UI perguntar sem precisar tratar erro. */
export function supportsCapability(
  capabilities: EmulatorCapabilities,
  capability: CapabilityName,
): boolean {
  return capabilities[capability];
}
