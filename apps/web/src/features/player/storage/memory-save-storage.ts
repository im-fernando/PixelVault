import { SaveQuotaExceededError } from './errors.js';
import { serializeSaveKey, type SaveKey } from './save-key.js';
import {
  metadataFromInput,
  type SaveMetadata,
  type SaveWriteInput,
  type StoredSave,
} from './save-record.js';
import type { SaveStorage, SaveStorageDriver } from './save-storage.js';

export interface MemorySaveStorageOptions {
  /**
   * Teto de bytes guardados. O fallback em memória vive na aba: sem limite,
   * uma sessão longa com save automático de um jogo grande empurraria a aba
   * para o OOM, que é uma falha bem pior que "não consegui salvar".
   */
  readonly maxBytes?: number;
}

const TETO_PADRAO = 32 * 1024 * 1024;

/**
 * Implementação em memória da porta. Some quando a aba fecha.
 *
 * Serve a dois papéis, e nenhum deles é gambiarra:
 *
 * - **Teste.** É a implementação que roda no Vitest, onde não existe OPFS nem
 *   IndexedDB. A regra de compatibilidade, o debounce e o fluxo de slots são
 *   exercitados contra ela.
 * - **Último recurso em produção.** Sem nenhum backend persistente, salvar em
 *   memória ainda permite usar save state dentro da sessão. O `driver` denuncia
 *   `'memory'` para a UI avisar que o progresso não sobrevive à aba.
 */
export class MemorySaveStorage implements SaveStorage {
  readonly driver: SaveStorageDriver = 'memory';

  readonly #registros = new Map<string, StoredSave>();
  readonly #tetoDeBytes: number;

  constructor(options: MemorySaveStorageOptions = {}) {
    this.#tetoDeBytes = options.maxBytes ?? TETO_PADRAO;
  }

  async read(key: SaveKey): Promise<StoredSave | null> {
    const registro = this.#registros.get(serializeSaveKey(key));
    if (registro === undefined) {
      return Promise.resolve(null);
    }
    // Cópia: quem lê não pode receber uma janela viva sobre o que está guardado.
    return Promise.resolve({ ...registro, data: registro.data.slice() });
  }

  async readThumbnail(key: SaveKey): Promise<Blob | null> {
    return Promise.resolve(this.#registros.get(serializeSaveKey(key))?.thumbnail ?? null);
  }

  async write(input: SaveWriteInput): Promise<SaveMetadata> {
    const chave = serializeSaveKey(input.key);
    const anterior = this.#registros.get(chave);
    const ocupado = this.#bytesOcupados() - (anterior?.data.byteLength ?? 0);
    if (ocupado + input.data.byteLength > this.#tetoDeBytes) {
      throw new SaveQuotaExceededError(input.key);
    }

    const metadata = metadataFromInput(input);
    this.#registros.set(chave, {
      metadata,
      data: input.data.slice(),
      thumbnail: input.thumbnail ?? null,
    });
    return Promise.resolve(metadata);
  }

  async remove(key: SaveKey): Promise<void> {
    this.#registros.delete(serializeSaveKey(key));
    return Promise.resolve();
  }

  async list(romId: string): Promise<readonly SaveMetadata[]> {
    const encontrados: SaveMetadata[] = [];
    for (const registro of this.#registros.values()) {
      if (registro.metadata.romId === romId) {
        encontrados.push(registro.metadata);
      }
    }
    return Promise.resolve(encontrados);
  }

  #bytesOcupados(): number {
    let total = 0;
    for (const registro of this.#registros.values()) {
      total += registro.data.byteLength;
    }
    return total;
  }
}
