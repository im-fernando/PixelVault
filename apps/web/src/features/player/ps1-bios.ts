export interface BiosPs1 {
  fileName: string;
  fileContent: Uint8Array<ArrayBuffer>;
}
let nestaSessao: BiosPs1 | null | undefined;

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open('pixelvault-ps1-bios', 1);
    pedido.onupgradeneeded = () => pedido.result.createObjectStore('bios');
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

export function validarBiosPs1(nome: string, bytes: Uint8Array): void {
  if (
    !/^(scph\d{4,5}|psxonpsp660)\.bin$/i.test(nome) ||
    bytes.length !== 512 * 1024 ||
    !new TextDecoder('latin1').decode(bytes).includes('Sony Computer Entertainment')
  )
    throw new Error(
      'BIOS inválida. Escolha uma BIOS de PS1 de 512 KiB, com o nome original scph….bin ou PSXONPSP660.bin.',
    );
}

export async function lerBiosPs1(): Promise<BiosPs1 | null> {
  if (nestaSessao !== undefined) return nestaSessao;
  const db = await abrir();
  try {
    const bios = await new Promise<BiosPs1 | null>((resolve, reject) => {
      const pedido = db.transaction('bios').objectStore('bios').get('selecionada');
      pedido.onsuccess = () => resolve(pedido.result ?? null);
      pedido.onerror = () => reject(pedido.error);
    });
    if (bios) validarBiosPs1(bios.fileName, bios.fileContent);
    nestaSessao = bios;
    return bios;
  } finally {
    db.close();
  }
}

/** Retorna false se só foi possível guardar nesta sessão. Não envia BIOS à API. */
export async function guardarBiosPs1(bios: BiosPs1 | null): Promise<boolean> {
  if (bios) validarBiosPs1(bios.fileName, bios.fileContent);
  nestaSessao = bios;
  try {
    const db = await abrir();
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction('bios', 'readwrite');
        const store = tx.objectStore('bios');
        if (bios) store.put(bios, 'selecionada');
        else store.delete('selecionada');
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.onabort = () => reject(tx.error);
      });
      return true;
    } finally {
      db.close();
    }
  } catch {
    return false;
  }
}
