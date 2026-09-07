import type { SaveKey } from './save-key.js';
import type { SaveMetadata, SaveWriteInput, StoredSave } from './save-record.js';

/** Qual backend está atendendo. A UI usa para avisar que a sessão é volátil. */
export type SaveStorageDriver = 'opfs' | 'indexeddb' | 'memory';

/**
 * A porta de persistência de save. **É esta a interface que a M4 troca.**
 *
 * O player não conhece OPFS, não conhece IndexedDB e não vai conhecer o
 * endpoint da nuvem: ele conhece isto. Trocar o save local por save
 * sincronizado é escrever mais um implementador — do mesmo jeito que trocar o
 * core de emulação é escrever mais um `EmulatorAdapter`. Ver docs/adr/0004.
 *
 * Três decisões que existem só para a M4 caber sem reescrita:
 *
 * - **Tudo é assíncrono**, inclusive o que o OPFS resolveria na hora. Uma
 *   porta com método síncrono não aceita implementação em rede depois.
 * - **A miniatura se lê separada dos bytes** (`readThumbnail`). Uma galeria de
 *   quatro slots não pode precisar baixar quatro save states inteiros de
 *   megabytes para desenhar quatro imagens de alguns KB.
 * - **A porta não conhece usuário.** Save local é do navegador; save na nuvem é
 *   da conta. O implementador da M4 fecha a conta no construtor dele, e a
 *   chave (`romId` + tipo + slot) continua a mesma dos dois lados.
 */
export interface SaveStorage {
  readonly driver: SaveStorageDriver;

  /** Bytes, metadados e miniatura. `null` quando não existe save nessa chave. */
  read(key: SaveKey): Promise<StoredSave | null>;

  /** Só a miniatura, sem arrastar os bytes do save. `null` quando não há. */
  readThumbnail(key: SaveKey): Promise<Blob | null>;

  /** Grava, substituindo o que houver. Devolve os metadados efetivamente gravados. */
  write(input: SaveWriteInput): Promise<SaveMetadata>;

  /** Apaga. Apagar o que não existe é sucesso — a intenção do chamador foi atendida. */
  remove(key: SaveKey): Promise<void>;

  /** Metadados de tudo que existe para uma ROM, sem bytes e sem miniatura. */
  list(romId: string): Promise<readonly SaveMetadata[]>;
}
