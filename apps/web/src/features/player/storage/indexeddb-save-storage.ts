import { toArrayBuffer } from './bytes.js';
import { translateStorageFailure } from './errors.js';
import { serializeSaveKey, type SaveKey } from './save-key.js';
import {
  metadataFromInput,
  saveMetadataSchema,
  type SaveMetadata,
  type SaveWriteInput,
  type StoredSave,
} from './save-record.js';
import type { SaveStorage, SaveStorageDriver } from './save-storage.js';

export const INDEXEDDB_NAME = 'pixelvault-saves';
export const INDEXEDDB_VERSION = 1;
const ARMAZEM = 'saves';
const INDICE_POR_ROM = 'romId';

/**
 * A miniatura é guardada desmontada, e não como `Blob`.
 *
 * `Blob` dentro do IndexedDB depende do clone estruturado do navegador, que
 * historicamente foi o canto mais irregular da API. Bytes e MIME separados
 * atravessam qualquer implementação, e remontar o `Blob` na leitura custa nada.
 */
interface MiniaturaGuardada {
  readonly bytes: ArrayBuffer;
  readonly type: string;
}

interface RegistroGuardado {
  readonly id: string;
  readonly romId: string;
  readonly metadata: unknown;
  readonly data: ArrayBuffer;
  readonly thumbnail: MiniaturaGuardada | null;
}

/**
 * Save local no IndexedDB. É o plano B do OPFS.
 *
 * Existe porque OPFS não é universal: aba anônima de alguns navegadores não dá
 * `navigator.storage.getDirectory()`, e navegador antigo não tem a API. Sem
 * este fallback, "salvar" viraria um recurso que às vezes existe.
 *
 * A transação do IndexedDB dá de graça o que o OPFS custou um protocolo de
 * commit: metadados, bytes e miniatura entram ou não entram juntos.
 */
export class IndexedDbSaveStorage implements SaveStorage {
  readonly driver: SaveStorageDriver = 'indexeddb';

  readonly #banco: IDBDatabase;

  constructor(banco: IDBDatabase) {
    this.#banco = banco;
  }

  static async open(factory: IDBFactory, name = INDEXEDDB_NAME): Promise<IndexedDbSaveStorage> {
    const requisicao = factory.open(name, INDEXEDDB_VERSION);
    requisicao.onupgradeneeded = () => {
      const banco = requisicao.result;
      if (!banco.objectStoreNames.contains(ARMAZEM)) {
        const armazem = banco.createObjectStore(ARMAZEM, { keyPath: 'id' });
        // Índice por ROM: a galeria lista os slots de um jogo, e varrer o
        // armazém inteiro para isso ficaria caro com a biblioteca cheia.
        armazem.createIndex(INDICE_POR_ROM, 'romId', { unique: false });
      }
    };
    return new IndexedDbSaveStorage(await promessaDeRequisicao(requisicao));
  }

  async read(key: SaveKey): Promise<StoredSave | null> {
    try {
      const registro = await this.#ler(key);
      if (registro === undefined) {
        return null;
      }
      const metadata = saveMetadataSchema.safeParse(registro.metadata);
      if (!metadata.success) {
        return null;
      }
      return {
        metadata: metadata.data,
        data: new Uint8Array(registro.data),
        thumbnail: montarMiniatura(registro.thumbnail),
      };
    } catch (erro) {
      throw translateStorageFailure('ler', key, erro);
    }
  }

  async readThumbnail(key: SaveKey): Promise<Blob | null> {
    try {
      return montarMiniatura((await this.#ler(key))?.thumbnail ?? null);
    } catch (erro) {
      throw translateStorageFailure('ler a miniatura do', key, erro);
    }
  }

  async write(input: SaveWriteInput): Promise<SaveMetadata> {
    const metadata = metadataFromInput(input);
    const registro: RegistroGuardado = {
      id: serializeSaveKey(input.key),
      romId: input.key.romId,
      metadata,
      data: toArrayBuffer(input.data),
      thumbnail: await desmontarMiniatura(input.thumbnail ?? null),
    };
    try {
      const transacao = this.#banco.transaction(ARMAZEM, 'readwrite');
      transacao.objectStore(ARMAZEM).put(registro);
      await promessaDeTransacao(transacao);
      return metadata;
    } catch (erro) {
      throw translateStorageFailure('gravar', input.key, erro);
    }
  }

  async remove(key: SaveKey): Promise<void> {
    try {
      const transacao = this.#banco.transaction(ARMAZEM, 'readwrite');
      transacao.objectStore(ARMAZEM).delete(serializeSaveKey(key));
      await promessaDeTransacao(transacao);
    } catch (erro) {
      throw translateStorageFailure('apagar', key, erro);
    }
  }

  async list(romId: string): Promise<readonly SaveMetadata[]> {
    const transacao = this.#banco.transaction(ARMAZEM, 'readonly');
    const requisicao: IDBRequest<RegistroGuardado[]> = transacao
      .objectStore(ARMAZEM)
      .index(INDICE_POR_ROM)
      .getAll(romId);
    const registros = await promessaDeRequisicao(requisicao);

    const encontrados: SaveMetadata[] = [];
    for (const registro of registros) {
      const metadata = saveMetadataSchema.safeParse(registro.metadata);
      if (metadata.success) {
        encontrados.push(metadata.data);
      }
    }
    return encontrados;
  }

  close(): void {
    this.#banco.close();
  }

  async #ler(key: SaveKey): Promise<RegistroGuardado | undefined> {
    const transacao = this.#banco.transaction(ARMAZEM, 'readonly');
    const requisicao: IDBRequest<RegistroGuardado | undefined> = transacao
      .objectStore(ARMAZEM)
      .get(serializeSaveKey(key));
    return promessaDeRequisicao(requisicao);
  }
}

function montarMiniatura(guardada: MiniaturaGuardada | null): Blob | null {
  return guardada === null ? null : new Blob([guardada.bytes], { type: guardada.type });
}

async function desmontarMiniatura(thumbnail: Blob | null): Promise<MiniaturaGuardada | null> {
  if (thumbnail === null) {
    return null;
  }
  return { bytes: await thumbnail.arrayBuffer(), type: thumbnail.type };
}

async function promessaDeRequisicao<T>(requisicao: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolver, rejeitar) => {
    requisicao.onsuccess = () => resolver(requisicao.result);
    requisicao.onerror = () => rejeitar(requisicao.error ?? new Error('requisição rejeitada'));
  });
}

/**
 * Espera a transação **fechar**, não a requisição responder.
 *
 * A diferença importa: `put` reporta sucesso antes do commit, e cota estourada
 * aparece no `abort` da transação. Resolver na requisição faria o save
 * "funcionar" e sumir.
 */
async function promessaDeTransacao(transacao: IDBTransaction): Promise<void> {
  return new Promise<void>((resolver, rejeitar) => {
    transacao.oncomplete = () => resolver();
    transacao.onabort = () => rejeitar(transacao.error ?? new Error('transação abortada'));
    transacao.onerror = () => rejeitar(transacao.error ?? new Error('transação com erro'));
  });
}
