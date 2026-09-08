/**
 * Como chamar, na estante, uma ROM que o catálogo não reconheceu.
 *
 * O caso comum do BYOR é `game_id` nulo (ADR 0006): o hash não casou com nada,
 * e o único nome que existe para aquele cartucho é o do arquivo que a pessoa
 * enviou. Escrever "não identificado" na etiqueta seria a interface desistindo
 * de uma informação que ela tem — quem mandou `Chrono Trigger (USA).sfc`
 * reconhece o próprio arquivo, e é isso que a prateleira precisa mostrar.
 *
 * A limpeza é curta de propósito: sai a extensão, e `_` e `.` viram espaço,
 * porque nome de dump usa os dois como separador. O resto fica — região,
 * revisão, marca de romhack. Tentar interpretar `(U) [!]` ou `[T+Por]` seria
 * adivinhação com cara de metadado, e erraria com confiança justamente nos
 * arquivos que o catálogo não conhece.
 *
 * O nome original continua inteiro em `user_roms.file_name`; isto aqui é
 * etiqueta, não renomeação. Editar metadado é outra conversa, e está fora da
 * #75 de propósito.
 */
export function tituloPeloNomeDoArquivo(fileName: string): string {
  const ponto = fileName.lastIndexOf('.');
  const semExtensao = ponto > 0 ? fileName.slice(0, ponto) : fileName;
  const limpo = semExtensao.replace(/[_.]+/g, ' ').replace(/\s+/g, ' ').trim();

  // Um nome que era só extensão e separador não sobra nada depois da limpeza —
  // e etiqueta vazia é pior que etiqueta feia. Nesse caso vale o nome cru.
  return limpo.length > 0 ? limpo : fileName;
}
