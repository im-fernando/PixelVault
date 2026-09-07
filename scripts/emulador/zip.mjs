import { inflateRawSync } from 'node:zlib';

/**
 * Leitor de ZIP mínimo, só o suficiente para os pacotes de core do RetroArch.
 *
 * Escrito à mão em vez de depender de uma biblioteca de descompactação porque
 * este script roda antes de qualquer coisa no `setup` e a superfície de
 * dependência dele é a superfície de confiança de um binário que vai executar
 * no navegador de quem joga. `node:zlib` já resolve os dois métodos de
 * compressão que o formato usa na prática (armazenado e deflate).
 */

const ASSINATURA_FIM_DO_DIRETORIO = 0x06054b50;
const ASSINATURA_ENTRADA_DO_DIRETORIO = 0x02014b50;
const TAMANHO_MINIMO_DO_FIM = 22;
const ARMAZENADO = 0;
const DEFLATE = 8;

/**
 * Extrai o ZIP em memória e devolve `nome -> conteúdo`.
 *
 * @param {Buffer} zip
 * @returns {Map<string, Buffer>}
 */
export function lerZip(zip) {
  const fim = localizarFimDoDiretorio(zip);
  const quantidade = zip.readUInt16LE(fim + 10);
  let offset = zip.readUInt32LE(fim + 16);

  const arquivos = new Map();
  for (let i = 0; i < quantidade; i += 1) {
    if (zip.readUInt32LE(offset) !== ASSINATURA_ENTRADA_DO_DIRETORIO) {
      throw new Error(`ZIP corrompido: entrada ${i} do diretório central sem assinatura`);
    }
    const metodo = zip.readUInt16LE(offset + 10);
    const tamanhoComprimido = zip.readUInt32LE(offset + 20);
    const tamanhoOriginal = zip.readUInt32LE(offset + 24);
    const tamanhoDoNome = zip.readUInt16LE(offset + 28);
    const tamanhoDoExtra = zip.readUInt16LE(offset + 30);
    const tamanhoDoComentario = zip.readUInt16LE(offset + 32);
    const offsetLocal = zip.readUInt32LE(offset + 42);
    const nome = zip.toString('utf8', offset + 46, offset + 46 + tamanhoDoNome);

    if (!nome.endsWith('/')) {
      arquivos.set(
        nome,
        extrair(zip, offsetLocal, metodo, tamanhoComprimido, tamanhoOriginal, nome),
      );
    }
    offset += 46 + tamanhoDoNome + tamanhoDoExtra + tamanhoDoComentario;
  }
  return arquivos;
}

function extrair(zip, offsetLocal, metodo, tamanhoComprimido, tamanhoOriginal, nome) {
  // O cabeçalho local repete nome e extra com tamanhos próprios; só ele diz
  // onde os bytes começam de verdade.
  const tamanhoDoNome = zip.readUInt16LE(offsetLocal + 26);
  const tamanhoDoExtra = zip.readUInt16LE(offsetLocal + 28);
  const inicio = offsetLocal + 30 + tamanhoDoNome + tamanhoDoExtra;
  const bruto = zip.subarray(inicio, inicio + tamanhoComprimido);

  const conteudo = metodo === ARMAZENADO ? Buffer.from(bruto) : inflar(metodo, bruto, nome);
  if (conteudo.length !== tamanhoOriginal) {
    throw new Error(
      `ZIP corrompido: "${nome}" saiu com ${conteudo.length} bytes, o índice diz ${tamanhoOriginal}`,
    );
  }
  return conteudo;
}

function inflar(metodo, bruto, nome) {
  if (metodo !== DEFLATE) {
    throw new Error(`"${nome}" usa o método de compressão ${metodo}, que este leitor não suporta`);
  }
  return inflateRawSync(bruto);
}

function localizarFimDoDiretorio(zip) {
  for (let i = zip.length - TAMANHO_MINIMO_DO_FIM; i >= 0; i -= 1) {
    if (zip.readUInt32LE(i) === ASSINATURA_FIM_DO_DIRETORIO) {
      return i;
    }
  }
  throw new Error('não parece um arquivo ZIP: fim do diretório central não encontrado');
}
