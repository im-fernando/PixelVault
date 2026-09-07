import { createSaveStorage, type SaveStorageEnvironment } from './create-save-storage.js';
import { SaveManager, type SaveManagerOptions } from './save-manager.js';

export interface CreateSaveManagerOptions extends Omit<SaveManagerOptions, 'storage'> {
  /**
   * A implementação da porta. Ausente, é detectada em runtime.
   *
   * É por aqui que a M4 entra: `storage: new CloudSaveStorage(conta)` e o
   * player continua exatamente como está.
   */
  readonly storage?: SaveManagerOptions['storage'];
  /** Só para teste: força quais backends a detecção enxerga. */
  readonly environment?: SaveStorageEnvironment;
}

/**
 * Monta o `SaveManager` já com o melhor storage disponível.
 *
 * É a composição, e mora separada do `SaveManager` de propósito: quem orquestra
 * emulador e porta não pode conhecer OPFS nem IndexedDB, senão a porta vira
 * decoração e a troca da M4 volta a mexer no player.
 */
export async function createSaveManager(options: CreateSaveManagerOptions): Promise<SaveManager> {
  const { storage, environment, ...resto } = options;
  return new SaveManager({
    ...resto,
    storage: storage ?? (await createSaveStorage(environment)),
  });
}
