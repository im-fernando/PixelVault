/**
 * Bytes na unidade em que a pessoa pensa neles.
 *
 * Mora num módulo próprio porque três telas mostram o mesmo número — a mesa de
 * envio, a estante pessoal e o termo de baixa —, e um arredondamento diferente
 * em cada uma faria a mesma ROM ter dois tamanhos no mesmo produto.
 */
export function emBytesLegiveis(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
