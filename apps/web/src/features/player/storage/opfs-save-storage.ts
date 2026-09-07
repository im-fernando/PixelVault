import { toArrayBuffer } from './bytes.js';
import { SaveCorruptedError, translateStorageFailure, type SaveStorageError } from './errors.js';
import { saveEntryName, type SaveKey } from './save-key.js';
import {
  metadataFromInput,
  saveMetadataSchema,
  type SaveMetadata,
  type SaveWriteInput,
  type StoredSave,
} from './save-record.js';
import type { SaveStorage, SaveStorageDriver } from './save-storage.js';

/** Pasta raiz dentro do OPFS. Nomeada para conviver com o que mais a origem guardar. */
export const OPFS_ROOT_DIRECTORY = 'pixelvault-saves';

const EXTENSAO_DADOS = '.bin';
const EXTENSAO_METADADOS = '.json';
const EXTENSAO_MINIATURA = '.thumb';

/**
 * Save local no Origin Private File System.
 *
 * É o backend principal por um motivo prático: o OPFS guarda arquivo, e save
 * de emulador é arquivo. Save state de PlayStation passa de 10 MB, e no
 * IndexedDB isso vira um registro que precisa ser serializado inteiro a cada
 * gravação.
 *
 * **O commit é o arquivo de metadados.** Toda gravação apaga o `.json`
 * primeiro, escreve os bytes, e só então reescreve o `.json`. Uma aba fechada
 * no meio deixa um `.bin` órfão, que `read` trata como ausente. É de
 * propósito: perder o save mais recente é ruim, mas carregar meio save state
 * corrompe a partida em silêncio, e silêncio é pior.
 */
export class OpfsSaveStorage implements SaveStorage {
  readonly driver: SaveStorageDriver = 'opfs';

  readonly #raiz: () => Promise<FileSystemDirectoryHandle>;

  constructor(raiz: () => Promise<FileSystemDirectoryHandle>) {
    this.#raiz = raiz;
  }

  /**
   * Abre a pasta de saves da origem.
   *
   * Não é o construtor porque o acesso ao OPFS pode falhar (aba anônima,
   * política de storage) e falha de disponibilidade tem que acontecer antes de
   * alguém começar a jogar, não na primeira tentativa de salvar. Criar a pasta
   * já aqui é a sonda: onde o OPFS é negado, é aqui que estoura.
   *
   * A raiz vem por parâmetro, e não de `navigator`, para o teste conseguir
   * exercitar este código com um duplo da API sem simular o navegador inteiro.
   */
  static async open(
    getRoot: () => Promise<FileSystemDirectoryHandle>,
    directory = OPFS_ROOT_DIRECTORY,
  ): Promise<OpfsSaveStorage> {
    const raiz = await getRoot();
    const pasta = await raiz.getDirectoryHandle(directory, { create: true });
    return new OpfsSaveStorage(() => Promise.resolve(pasta));
  }

  async read(key: SaveKey): Promise<StoredSave | null> {
    try {
      const pasta = await this.#pastaDaRom(key.romId, false);
      if (pasta === null) {
        return null;
      }
      const nome = saveEntryName(key);
      const metadata = await this.#lerMetadados(pasta, nome, key);
      if (metadata === null) {
        return null;
      }

      const bytes = await lerArquivo(pasta, `${nome}${EXTENSAO_DADOS}`);
      if (bytes === null) {
        // Metadados sem dados: gravação interrompida depois do commit, ou
        // alguém apagou o arquivo por fora. Não dá para fingir que está lá.
        throw new SaveCorruptedError(key, 'os metadados existem, mas os bytes do save não');
      }

      const thumbnail = metadata.hasThumbnail
        ? await lerArquivoComoBlob(pasta, `${nome}${EXTENSAO_MINIATURA}`)
        : null;

      return { metadata, data: new Uint8Array(await bytes.arrayBuffer()), thumbnail };
    } catch (erro) {
      throw this.#traduzir('ler', key, erro);
    }
  }

  async readThumbnail(key: SaveKey): Promise<Blob | null> {
    try {
      const pasta = await this.#pastaDaRom(key.romId, false);
      if (pasta === null) {
        return null;
      }
      return await lerArquivoComoBlob(pasta, `${saveEntryName(key)}${EXTENSAO_MINIATURA}`);
    } catch (erro) {
      throw this.#traduzir('ler a miniatura d', key, erro);
    }
  }

  async write(input: SaveWriteInput): Promise<SaveMetadata> {
    const { key } = input;
    const metadata = metadataFromInput(input);
    try {
      const pasta = await this.#pastaDaRom(key.romId, true);
      if (pasta === null) {
        throw new Error('a pasta da ROM não pôde ser criada');
      }
      const nome = saveEntryName(key);

      // Passo 1: derruba o commit anterior. A partir daqui o registro é
      // inválido, e é assim que ele deve ser lido se algo interromper.
      await removerSeExistir(pasta, `${nome}${EXTENSAO_METADADOS}`);
      await escreverArquivo(pasta, `${nome}${EXTENSAO_DADOS}`, toArrayBuffer(input.data));
      const miniatura = input.thumbnail ?? null;
      if (miniatura !== null) {
        await escreverArquivo(pasta, `${nome}${EXTENSAO_MINIATURA}`, miniatura);
      } else {
        await removerSeExistir(pasta, `${nome}${EXTENSAO_MINIATURA}`);
      }
      // Passo final: o commit.
      await escreverArquivo(
        pasta,
        `${nome}${EXTENSAO_METADADOS}`,
        toArrayBuffer(new TextEncoder().encode(JSON.stringify(metadata))),
      );
      return metadata;
    } catch (erro) {
      throw this.#traduzir('gravar', key, erro);
    }
  }

  async remove(key: SaveKey): Promise<void> {
    try {
      const pasta = await this.#pastaDaRom(key.romId, false);
      if (pasta === null) {
        return;
      }
      const nome = saveEntryName(key);
      // Metadados primeiro: se o resto falhar, o registro já está invisível.
      await removerSeExistir(pasta, `${nome}${EXTENSAO_METADADOS}`);
      await removerSeExistir(pasta, `${nome}${EXTENSAO_DADOS}`);
      await removerSeExistir(pasta, `${nome}${EXTENSAO_MINIATURA}`);
    } catch (erro) {
      throw this.#traduzir('apagar', key, erro);
    }
  }

  async list(romId: string): Promise<readonly SaveMetadata[]> {
    const pasta = await this.#pastaDaRom(romId, false);
    if (pasta === null) {
      return [];
    }
    const encontrados: SaveMetadata[] = [];
    for await (const [nome, handle] of pasta.entries()) {
      if (!nome.endsWith(EXTENSAO_METADADOS) || handle.kind !== 'file') {
        continue;
      }
      const metadata = await interpretarMetadados(handle as FileSystemFileHandle);
      // Listagem tolera lixo: um `.json` ilegível vira slot ausente na galeria,
      // e não uma tela de erro que impede de carregar os outros três.
      if (metadata !== null && metadata.romId === romId) {
        encontrados.push(metadata);
      }
    }
    return encontrados;
  }

  async #pastaDaRom(romId: string, criar: boolean): Promise<FileSystemDirectoryHandle | null> {
    const raiz = await this.#raiz();
    try {
      return await raiz.getDirectoryHandle(safeDirectoryName(romId), { create: criar });
    } catch (erro) {
      if (ehNaoEncontrado(erro)) {
        return null;
      }
      throw erro;
    }
  }

  async #lerMetadados(
    pasta: FileSystemDirectoryHandle,
    nome: string,
    key: SaveKey,
  ): Promise<SaveMetadata | null> {
    let handle: FileSystemFileHandle;
    try {
      handle = await pasta.getFileHandle(`${nome}${EXTENSAO_METADADOS}`);
    } catch (erro) {
      if (ehNaoEncontrado(erro)) {
        return null;
      }
      throw erro;
    }
    const metadata = await interpretarMetadados(handle);
    if (metadata === null) {
      throw new SaveCorruptedError(key, 'os metadados do save não são legíveis');
    }
    return metadata;
  }

  #traduzir(operacao: string, key: SaveKey, erro: unknown): SaveStorageError {
    return translateStorageFailure(`${operacao}o`, key, erro);
  }
}

/**
 * Nome de pasta seguro a partir de um `romId` arbitrário.
 *
 * O `romId` é um SHA-256 na prática, mas a porta aceita string qualquer e o
 * OPFS recusa `/` e `\` no nome. Escapar em vez de hashear mantém a pasta
 * legível no DevTools, o que economiza uma tarde quando algo não aparece.
 */
export function safeDirectoryName(romId: string): string {
  return romId.replace(/[^a-zA-Z0-9._-]/g, (caractere) => {
    const codigo = caractere.codePointAt(0) ?? 0;
    return `_${codigo.toString(16)}_`;
  });
}

async function interpretarMetadados(handle: FileSystemFileHandle): Promise<SaveMetadata | null> {
  try {
    const arquivo = await handle.getFile();
    const resultado = saveMetadataSchema.safeParse(JSON.parse(await arquivo.text()));
    return resultado.success ? resultado.data : null;
  } catch {
    return null;
  }
}

async function lerArquivo(pasta: FileSystemDirectoryHandle, nome: string): Promise<File | null> {
  try {
    return await (await pasta.getFileHandle(nome)).getFile();
  } catch (erro) {
    if (ehNaoEncontrado(erro)) {
      return null;
    }
    throw erro;
  }
}

async function lerArquivoComoBlob(
  pasta: FileSystemDirectoryHandle,
  nome: string,
): Promise<Blob | null> {
  const arquivo = await lerArquivo(pasta, nome);
  if (arquivo === null) {
    return null;
  }
  // O `File` do OPFS não guarda MIME; a miniatura é sempre imagem comprimida,
  // e sem tipo o `<img>` de alguns navegadores recusa o object URL.
  return arquivo.type === '' ? arquivo.slice(0, arquivo.size, 'image/webp') : arquivo;
}

async function escreverArquivo(
  pasta: FileSystemDirectoryHandle,
  nome: string,
  conteudo: ArrayBuffer | Blob,
): Promise<void> {
  const handle = await pasta.getFileHandle(nome, { create: true });
  const fluxo = await handle.createWritable();
  try {
    await fluxo.write(conteudo);
  } catch (erro) {
    // `close()` num fluxo que falhou propaga o erro original mascarado;
    // aborta e deixa o erro de verdade subir.
    await fluxo.abort().catch(() => undefined);
    throw erro;
  }
  await fluxo.close();
}

async function removerSeExistir(pasta: FileSystemDirectoryHandle, nome: string): Promise<void> {
  try {
    await pasta.removeEntry(nome);
  } catch (erro) {
    if (!ehNaoEncontrado(erro)) {
      throw erro;
    }
  }
}

function ehNaoEncontrado(erro: unknown): boolean {
  return (
    typeof erro === 'object' &&
    erro !== null &&
    'name' in erro &&
    (erro as { name?: unknown }).name === 'NotFoundError'
  );
}
