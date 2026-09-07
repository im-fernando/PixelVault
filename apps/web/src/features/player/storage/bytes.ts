/**
 * Cópia dos bytes num `ArrayBuffer` próprio.
 *
 * Não é conversão cosmética: `Uint8Array` pode estar apoiada num
 * `SharedArrayBuffer`, e nem `Blob` nem `FileSystemWritableFileStream` aceitam
 * isso. Copiar também garante que o que foi para o disco não muda debaixo da
 * gravação — a SRAM continua sendo escrita pelo core enquanto salvamos.
 */
export function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const destino = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(destino).set(bytes);
  return destino;
}
