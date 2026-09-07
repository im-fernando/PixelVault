import type { SystemId } from '@pixelvault/contracts';
import type { EmulatorAdapter } from '../adapter/emulator-adapter.js';
import { AdapterAlreadyRegisteredError, SystemUnsupportedError } from '../adapter/errors.js';

/**
 * Cria um adapter já configurado.
 *
 * A fábrica não recebe parâmetro nenhum de propósito: tudo que um core precisa
 * — caminho do WASM, opções de áudio, shader — varia por runtime, e colocar
 * isso na assinatura amarraria o registry ao runtime que estiver ganhando hoje.
 * A configuração é fechada no closure no momento do registro.
 */
export type EmulatorAdapterFactory = () => EmulatorAdapter | Promise<EmulatorAdapter>;

export interface RegisterAdapterOptions {
  /** Substitui um registro existente. Serve para trocar o core real pelo falso em teste. */
  readonly replace?: boolean;
}

/**
 * De `systemId` para o adapter que sabe emular aquele console.
 *
 * É instância, e não singleton de módulo, porque estado global compartilhado
 * entre testes vaza: um teste que registra um adapter falso não pode decidir o
 * resultado do próximo.
 */
export class EmulatorRegistry {
  readonly #fabricas = new Map<SystemId, EmulatorAdapterFactory>();

  register(
    systemId: SystemId,
    factory: EmulatorAdapterFactory,
    options: RegisterAdapterOptions = {},
  ): void {
    if (this.#fabricas.has(systemId) && options.replace !== true) {
      // Dois adapters disputando o mesmo console é bug, e bug silencioso vira
      // "às vezes o jogo abre com o core errado".
      throw new AdapterAlreadyRegisteredError(systemId);
    }
    this.#fabricas.set(systemId, factory);
  }

  unregister(systemId: SystemId): boolean {
    return this.#fabricas.delete(systemId);
  }

  supports(systemId: SystemId): boolean {
    return this.#fabricas.has(systemId);
  }

  /** Ordenado, para a UI listar os consoles jogáveis sem depender da ordem de registro. */
  supportedSystems(): SystemId[] {
    return [...this.#fabricas.keys()].sort();
  }

  async create(systemId: SystemId): Promise<EmulatorAdapter> {
    const fabrica = this.#fabricas.get(systemId);
    if (fabrica === undefined) {
      throw new SystemUnsupportedError(systemId);
    }
    const adapter = await fabrica();
    if (adapter.systemId !== systemId) {
      throw new SystemUnsupportedError(
        systemId,
        `a fábrica registrada devolveu um adapter de "${adapter.systemId}"`,
      );
    }
    return adapter;
  }
}
