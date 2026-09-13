/**
 * Os arquivos de um `drop`, mesmo quando o que foi arrastado é uma pasta.
 *
 * `DataTransfer.files` só vê o primeiro nível: soltar uma pasta nela devolve
 * lista vazia, porque uma pasta não é um `File`. Quem sabe descer dentro dela
 * é a API de entradas (`webkitGetAsEntry`), suportada por todo navegador que
 * já suporta `<input webkitdirectory>` — as duas nasceram juntas no Chrome e
 * foram adotadas pelos outros do mesmo jeito.
 *
 * Sem essa API (Firefox de versões antigas, ou o ambiente de teste), cai para
 * `DataTransfer.files` puro — o mesmo suporte que existia antes de arrastar
 * pasta ser possível, nunca pior que isso.
 */
export async function arquivosDoDrop(dataTransfer: DataTransfer): Promise<File[]> {
  const entradas = Array.from(dataTransfer.items)
    .map((item) => (typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null))
    .filter((entrada): entrada is FileSystemEntry => entrada !== null);

  if (entradas.length === 0) return Array.from(dataTransfer.files);

  const arquivos: File[] = [];
  await Promise.all(entradas.map((entrada) => coletar(entrada, arquivos)));
  return arquivos;
}

async function coletar(entrada: FileSystemEntry, destino: File[]): Promise<void> {
  if (entrada.isFile) {
    destino.push(
      await new Promise<File>((resolver, recusar) =>
        (entrada as FileSystemFileEntry).file(resolver, recusar),
      ),
    );
    return;
  }
  if (!entrada.isDirectory) return;

  const leitor = (entrada as FileSystemDirectoryEntry).createReader();
  // `readEntries` devolve em lotes por razão de memória — um diretório com
  // milhares de arquivos não caberia numa chamada só. Lote vazio é o sinal de
  // que o diretório terminou, não de que ele está vazio: um diretório vazio
  // de verdade também produz exatamente um lote vazio, e o `do...while` já
  // trata os dois casos igual, sem diferença observável.
  let lote: FileSystemEntry[];
  do {
    lote = await new Promise<FileSystemEntry[]>((resolver, recusar) =>
      leitor.readEntries(resolver, recusar),
    );
    await Promise.all(lote.map((item) => coletar(item, destino)));
  } while (lote.length > 0);
}
