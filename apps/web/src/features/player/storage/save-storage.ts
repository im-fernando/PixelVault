import type { SaveKey } from './save-key.js';
import type { SaveMetadata, SaveWriteInput, StoredSave } from './save-record.js';

/** Qual backend está atendendo. A UI usa para avisar que a sessão é volátil. */
export type SaveStorageDriver = 'opfs' | 'indexeddb' | 'memory';

/**
 * A porta de persistência do save LOCAL, do navegador.
 *
 * **A M4 não troca esta interface — o save da nuvem fica ao lado dela, nunca
 * no lugar.** O ADR 0020 decidiu isso depois deste comentário ter sido
 * escrito de outro jeito: a adoção é cópia, não mudança de lugar (regra 3), e
 * o save local continua sendo lido e gravado normalmente durante o jogo
 * (latência, funciona offline). A nuvem é sincronização à parte — outro
 * mecanismo, no módulo `progress` da API — e não um novo implementador de
 * `SaveStorage` que substitui o de dentro do navegador.
 *
 * O player não conhece OPFS nem IndexedDB: ele conhece isto. Trocar de OPFS
 * para IndexedDB (ou para memória, no pior caso) é escrever mais um
 * implementador — do mesmo jeito que trocar o core de emulação é escrever
 * mais um `EmulatorAdapter`. Ver docs/adr/0004.
 *
 * Duas decisões da porta continuam servindo à M4, mesmo sem trocar quem a
 * implementa:
 *
 * - **A miniatura se lê separada dos bytes** (`readThumbnail`). Uma galeria de
 *   quatro slots não pode precisar baixar quatro save states inteiros de
 *   megabytes para desenhar quatro imagens de alguns KB — e é a mesma
 *   necessidade do lado da nuvem, na tela de adoção.
 * - **`write` recebe `updatedAt` de fora**, em vez de chamar `Date.now()` por
 *   conta própria (ver `save-record.ts`). É o que permite a nuvem carimbar o
 *   relógio do servidor no que sobe, sem mexer nesta porta.
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
