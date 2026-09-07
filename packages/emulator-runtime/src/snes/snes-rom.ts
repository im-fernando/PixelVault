import { RomInvalidError } from '../adapter/errors.js';
import {
  describeRomSource,
  openRomStream,
  readRomHeader,
  type RomSource,
} from '../adapter/rom-source.js';

/** Cabeçalho interno do cartucho, como o console o enxerga. */
export interface CabecalhoSnes {
  readonly titulo: string;
  /** Onde o bloco de 32 bytes começa dentro do arquivo, já com o desvio do copiador. */
  readonly offset: number;
  readonly mapeamento: 'LoROM' | 'HiROM' | 'ExHiROM';
  /** Bytes de bateria declarados pelo cartucho. `0` é cartucho que não salva. */
  readonly bytesDeSram: number;
  /** Existe um cabeçalho de copiador de 512 bytes na frente do arquivo. */
  readonly temCabecalhoDeCopiador: boolean;
}

export interface RomDeSnes {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  /** Identidade estável do conteúdo. Save state de outra ROM é recusado por ela. */
  readonly romId: string;
  readonly cabecalho: CabecalhoSnes;
}

const BYTES_DE_TRIAGEM = 1024;
const TAMANHO_DO_CABECALHO_DE_COPIADOR = 512;
const TAMANHO_DO_BLOCO = 32;

/** Onde o bloco de 32 bytes fica em cada mapeamento, medido do início da ROM. */
const CANDIDATOS = [
  { offset: 0x7fc0, mapeamento: 'LoROM' },
  { offset: 0xffc0, mapeamento: 'HiROM' },
  { offset: 0x40ffc0, mapeamento: 'ExHiROM' },
] as const;

/**
 * Assinaturas de arquivos que claramente são de outro console.
 *
 * Existe para o caso da issue #16 "ROM de sistema errado": recusar um `.nes`
 * antes de baixar 700 MB é a diferença entre um erro imediato e uma tela de
 * carregamento que termina em falha. A checagem é feita com
 * `readRomHeader`, sem materializar o arquivo.
 */
const ASSINATURAS_DE_OUTROS_CONSOLES = [
  { offset: 0x00, bytes: [0x4e, 0x45, 0x53, 0x1a], sistema: 'NES (iNES)' },
  { offset: 0x104, bytes: [0xce, 0xed, 0x66, 0x66], sistema: 'Game Boy / Game Boy Color' },
  { offset: 0x100, bytes: [0x53, 0x45, 0x47, 0x41], sistema: 'Mega Drive' },
  { offset: 0x00, bytes: [0x50, 0x4b, 0x03, 0x04], sistema: 'arquivo ZIP, não uma ROM' },
] as const;

/**
 * Recusa, lendo só o começo, o que obviamente não é SNES.
 *
 * Roda **antes** de consumir a ROM inteira, que é o que faz valer a pena o
 * `RomSource` ser preguiçoso.
 */
export async function triarRomDeSnes(source: RomSource): Promise<void> {
  const rotulo = describeRomSource(source);
  const inicio = await readRomHeader(source, BYTES_DE_TRIAGEM);
  if (inicio.byteLength === 0) {
    throw new RomInvalidError(`${rotulo} não tem bytes`);
  }
  for (const assinatura of ASSINATURAS_DE_OUTROS_CONSOLES) {
    if (combina(inicio, assinatura.offset, assinatura.bytes)) {
      throw new RomInvalidError(`${rotulo} é ${assinatura.sistema}, e este adapter é de SNES`);
    }
  }
}

/**
 * Materializa a ROM e reconhece o cabeçalho.
 *
 * **Aqui a ROM deixa de ser preguiçosa, e é de propósito.** O RetroArch em
 * WebAssembly não lê conteúdo por streaming: o Nostalgist grava o arquivo
 * inteiro no sistema de arquivos do Emscripten antes de chamar `main`, e o core
 * abre esse arquivo já completo. Não existe caminho incremental para dar. O
 * `RomSource` continua valendo — a triagem acima e a escolha de core acontecem
 * sem materializar nada, e é só neste ponto, depois de decidido que a ROM
 * serve, que se paga o preço do arquivo completo.
 *
 * Para SNES o custo é conhecido e aceitável: o maior cartucho comercial tem
 * 6 MB. Um adapter de PlayStation não poderia fazer isto, e é por isso que o
 * contrato não obriga ninguém a fazer.
 */
export async function lerRomDeSnes(source: RomSource): Promise<RomDeSnes> {
  await triarRomDeSnes(source);

  const rotulo = describeRomSource(source);
  const bytes = await consumirStream(source, rotulo);
  const cabecalho = reconhecerCabecalho(bytes);
  if (cabecalho === null) {
    throw new RomInvalidError(
      `${rotulo} não tem cabeçalho de SNES reconhecível (nem LoROM, nem HiROM, nem ExHiROM)`,
    );
  }

  return {
    bytes,
    fileName: nomeDeArquivo(source, rotulo),
    romId: identidade(bytes),
    cabecalho,
  };
}

/**
 * Acha o bloco de 32 bytes do cartucho.
 *
 * O critério é o complemento do checksum: o cartucho grava `checksum` e
 * `~checksum`, e a soma dos dois é `0xFFFF`. É o único teste barato que não dá
 * falso positivo em dados aleatórios — título "parece texto" dá.
 */
export function reconhecerCabecalho(bytes: Uint8Array): CabecalhoSnes | null {
  const temCopiador = bytes.byteLength % 1024 === TAMANHO_DO_CABECALHO_DE_COPIADOR;
  const desvio = temCopiador ? TAMANHO_DO_CABECALHO_DE_COPIADOR : 0;

  for (const candidato of CANDIDATOS) {
    const offset = candidato.offset + desvio;
    if (offset + TAMANHO_DO_BLOCO > bytes.byteLength) {
      continue;
    }
    const bloco = bytes.subarray(offset, offset + TAMANHO_DO_BLOCO);
    const complemento = leUint16(bloco, 0x1c);
    const checksum = leUint16(bloco, 0x1e);
    if (((complemento + checksum) & 0xffff) !== 0xffff) {
      continue;
    }
    return {
      titulo: titulo(bloco),
      offset,
      mapeamento: candidato.mapeamento,
      bytesDeSram: bytesDeSram(bloco),
      temCabecalhoDeCopiador: temCopiador,
    };
  }
  return null;
}

async function consumirStream(source: RomSource, rotulo: string): Promise<Uint8Array> {
  const leitor = (await openRomStream(source)).getReader();
  const pedacos: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await leitor.read();
      if (done || value === undefined) {
        break;
      }
      pedacos.push(value);
      total += value.byteLength;
    }
  } finally {
    leitor.releaseLock();
  }
  if (total === 0) {
    throw new RomInvalidError(`${rotulo} não tem bytes`);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const pedaco of pedacos) {
    bytes.set(pedaco, offset);
    offset += pedaco.byteLength;
  }
  return bytes;
}

/**
 * O core decide o formato pela extensão do nome, então um nome sempre precisa
 * existir — mesmo quando a fonte não trouxe um.
 */
function nomeDeArquivo(source: RomSource, rotulo: string): string {
  if (source.fileName !== undefined && source.fileName.length > 0) {
    return source.fileName;
  }
  const doUrl = source.kind === 'url' ? (source.url.split('/').pop() ?? '') : '';
  return /\.(sfc|smc|fig|swc)$/i.test(doUrl) ? doUrl : `${sanitizar(rotulo)}.sfc`;
}

function sanitizar(rotulo: string): string {
  return rotulo.replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 48) || 'rom';
}

/**
 * FNV-1a de 32 bits sobre o conteúdo.
 *
 * Não é criptográfico e não precisa ser: serve para dizer "este save state é de
 * outra ROM", não para provar procedência. Um SHA-256 de 4 MB por carga
 * custaria mais do que o problema vale, e a verificação forte fica no servidor,
 * onde o `catalog` já guarda o hash do arquivo.
 */
function identidade(bytes: Uint8Array): string {
  let hash = 0x811c9dc5;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${bytes.byteLength.toString(16)}-${(hash >>> 0).toString(16)}`;
}

function combina(bytes: Uint8Array, offset: number, esperado: readonly number[]): boolean {
  if (offset + esperado.length > bytes.byteLength) {
    return false;
  }
  return esperado.every((valor, i) => bytes[offset + i] === valor);
}

function leUint16(bloco: Uint8Array, offset: number): number {
  return (bloco[offset] ?? 0) | ((bloco[offset + 1] ?? 0) << 8);
}

function titulo(bloco: Uint8Array): string {
  let saida = '';
  for (let i = 0; i < 21; i += 1) {
    const byte = bloco[i] ?? 0;
    saida += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : ' ';
  }
  return saida.trim();
}

/**
 * O byte `$FFD8` guarda o expoente da bateria: `0` é cartucho que não salva,
 * `n` são `1024 << n` bytes. Confere com os homebrews do catálogo — Sure
 * Instinct declara `3` e tem 8 KB, EUC Thrills declara `1` e tem 2 KB.
 */
function bytesDeSram(bloco: Uint8Array): number {
  const expoente = bloco[0x18] ?? 0;
  return expoente === 0 || expoente > 12 ? 0 : 1024 << expoente;
}
