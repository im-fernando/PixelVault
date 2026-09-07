import { SaveStorageUnavailableError } from './errors.js';
import { IndexedDbSaveStorage } from './indexeddb-save-storage.js';
import { MemorySaveStorage } from './memory-save-storage.js';
import { OpfsSaveStorage } from './opfs-save-storage.js';
import type { SaveStorage } from './save-storage.js';

/**
 * De onde a detecção tira os backends.
 *
 * Existe para o teste poder dizer "este navegador não tem OPFS" sem simular um
 * navegador — que é justamente o cenário que a issue pede para cobrir e que
 * não dá para reproduzir olhando para `globalThis`.
 */
export interface SaveStorageEnvironment {
  /** `undefined` significa "esta origem não tem OPFS". */
  readonly opfs?: () => Promise<FileSystemDirectoryHandle>;
  readonly indexedDB?: IDBFactory;
  /**
   * Sem nenhum backend persistente, guardar em memória permite usar save state
   * dentro da sessão. `false` troca isso por `SaveStorageUnavailableError`.
   */
  readonly allowMemoryFallback?: boolean;
}

/**
 * Escolhe o melhor backend disponível **em runtime**.
 *
 * A detecção é por tentativa, não por `typeof`: aba anônima expõe
 * `navigator.storage.getDirectory` e falha na chamada, e um `if (api in window)`
 * escolheria o OPFS para depois quebrar na primeira gravação — quando quem
 * está jogando já tem progresso a perder.
 *
 * A ordem é OPFS, IndexedDB, memória. O `driver` do resultado diz qual saiu, e
 * `'memory'` é o sinal para a UI avisar que nada sobrevive ao fechar a aba.
 */
export async function createSaveStorage(
  environment: SaveStorageEnvironment = defaultEnvironment(),
): Promise<SaveStorage> {
  const recusas: string[] = [];

  if (environment.opfs !== undefined) {
    try {
      return await OpfsSaveStorage.open(environment.opfs);
    } catch (erro) {
      recusas.push(`OPFS: ${descrever(erro)}`);
    }
  } else {
    recusas.push('OPFS: indisponível nesta origem');
  }

  if (environment.indexedDB !== undefined) {
    try {
      return await IndexedDbSaveStorage.open(environment.indexedDB);
    } catch (erro) {
      recusas.push(`IndexedDB: ${descrever(erro)}`);
    }
  } else {
    recusas.push('IndexedDB: indisponível nesta origem');
  }

  const motivo = recusas.join('; ');
  if (environment.allowMemoryFallback === false) {
    throw new SaveStorageUnavailableError(motivo);
  }
  console.warn(`[player/storage] sem storage persistente, salvando só em memória — ${motivo}`);
  return new MemorySaveStorage();
}

/** O que este navegador oferece de verdade. */
export function defaultEnvironment(): SaveStorageEnvironment {
  const ambiente: {
    opfs?: () => Promise<FileSystemDirectoryHandle>;
    indexedDB?: IDBFactory;
  } = {};

  if (typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function') {
    ambiente.opfs = () => navigator.storage.getDirectory();
  }
  if (typeof indexedDB !== 'undefined') {
    ambiente.indexedDB = indexedDB;
  }
  return ambiente;
}

function descrever(erro: unknown): string {
  return erro instanceof Error ? `${erro.name}: ${erro.message}` : String(erro);
}
