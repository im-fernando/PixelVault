/**
 * Persistência local de save do player — SRAM e save state.
 *
 * **Esta é a única superfície pública.** O player importa daqui e de mais
 * lugar nenhum: quem consumir `opfs-save-storage.js` direto amarra a tela ao
 * backend, que é exatamente o acoplamento que a M4 vai precisar desfazer.
 *
 * O caminho normal é curto:
 *
 * ```ts
 * const saves = await createSaveManager({ emulator, romId });
 * const parar = saves.watchSram();     // save automático da bateria
 * await saves.restoreSram();           // progresso de quem já jogou
 * await saves.saveState(2);            // fotografia + miniatura
 * await saves.loadState(2);            // recusa state de outro core
 * await saves.dispose();               // grava o pendente e desliga
 * ```
 */

export { SaveManager, SRAM_DEBOUNCE_PADRAO_MS } from './save-manager.js';
export type { SaveCapableEmulator, SaveManagerOptions, SaveSlotView } from './save-manager.js';

export { createSaveManager } from './create-save-manager.js';
export type { CreateSaveManagerOptions } from './create-save-manager.js';

export { useSramLocal } from './use-sram-local.js';
export type { EstadoDoSramLocal } from './use-sram-local.js';

export { createSaveStorage, defaultEnvironment } from './create-save-storage.js';
export type { SaveStorageEnvironment } from './create-save-storage.js';

export type { SaveStorage, SaveStorageDriver } from './save-storage.js';

export { SAVE_SLOTS, isSaveSlot, sramKey, stateKey } from './save-key.js';
export type { SaveKey, SaveSlot } from './save-key.js';

export { SAVE_RECORD_FORMAT, saveMetadataSchema } from './save-record.js';
export type { SaveMetadata, SaveWriteInput, StoredSave } from './save-record.js';

export { describeIncompatibility, isCompatible } from './compatibility.js';
export type { MachineIdentity } from './compatibility.js';

export {
  THUMBNAIL_DEFAULTS,
  THUMBNAIL_PLACEHOLDER,
  captureThumbnail,
  revokeThumbnailUrl,
  thumbnailUrl,
} from './thumbnail.js';
export type { ThumbnailOptions } from './thumbnail.js';

export {
  SaveCapabilityUnsupportedError,
  SaveCorruptedError,
  SaveIncompatibleError,
  SaveIoError,
  SaveNotFoundError,
  SaveQuotaExceededError,
  SaveStorageError,
  SaveStorageUnavailableError,
  isSaveStorageError,
} from './errors.js';
export type { SaveStorageErrorCode } from './errors.js';

// Implementações da porta. Exportadas para teste e para composição explícita
// (o player não deveria nomear nenhuma delas).
export { MemorySaveStorage } from './memory-save-storage.js';
export { IndexedDbSaveStorage } from './indexeddb-save-storage.js';
export { OpfsSaveStorage, OPFS_ROOT_DIRECTORY } from './opfs-save-storage.js';
