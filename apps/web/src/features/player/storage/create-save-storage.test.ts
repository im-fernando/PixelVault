import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSaveStorage, defaultEnvironment } from './create-save-storage.js';
import { SaveStorageUnavailableError } from './errors.js';

/** Duplo mínimo do OPFS: só o bastante para a sonda de disponibilidade passar. */
function opfsQueFunciona(): () => Promise<FileSystemDirectoryHandle> {
  const raiz = {
    getDirectoryHandle: () => Promise.resolve(raiz),
  } as unknown as FileSystemDirectoryHandle;
  return () => Promise.resolve(raiz);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('createSaveStorage — escolha do backend', () => {
  it('prefere OPFS quando ele responde', async () => {
    const storage = await createSaveStorage({
      opfs: opfsQueFunciona(),
      indexedDB: new IDBFactory(),
    });
    expect(storage.driver).toBe('opfs');
  });

  /**
   * O cenário real: aba anônima expõe a API e nega o acesso. Detectar por
   * `typeof` escolheria o OPFS e só quebraria na primeira gravação, quando
   * quem está jogando já tem progresso a perder.
   */
  it('cai para IndexedDB quando o OPFS existe mas nega acesso', async () => {
    const storage = await createSaveStorage({
      opfs: () => Promise.reject(new DOMException('negado', 'SecurityError')),
      indexedDB: new IDBFactory(),
    });
    expect(storage.driver).toBe('indexeddb');
  });

  it('cai para IndexedDB quando esta origem não tem OPFS nenhum', async () => {
    const storage = await createSaveStorage({ indexedDB: new IDBFactory() });
    expect(storage.driver).toBe('indexeddb');
  });

  it('cai para memória, avisando, quando nada persiste', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = await createSaveStorage({});

    expect(storage.driver).toBe('memory');
    expect(aviso.mock.calls[0]?.[0]).toContain('OPFS: indisponível');
    expect(aviso.mock.calls[0]?.[0]).toContain('IndexedDB: indisponível');
  });

  it('estoura em vez de fingir persistência quando o fallback é recusado', async () => {
    await expect(createSaveStorage({ allowMemoryFallback: false })).rejects.toBeInstanceOf(
      SaveStorageUnavailableError,
    );
  });
});

describe('defaultEnvironment', () => {
  /**
   * Vitest roda em Node, que não tem nenhuma das duas APIs. É a prova de que a
   * detecção não assume navegador — e o motivo de a suíte inteira poder
   * injetar o ambiente em vez de simular um.
   */
  it('não enxerga OPFS nem IndexedDB fora do navegador', () => {
    const ambiente = defaultEnvironment();
    expect(ambiente.opfs).toBeUndefined();
    expect(ambiente.indexedDB).toBeUndefined();
  });
});
