/**
 * ROMs de mentira que passam pela verificação de verdade.
 *
 * Nenhum arquivo real entra no repositório: ROM comercial não é
 * redistribuível (ADR 0006) e homebrew de verdade tornaria o teste dependente
 * de um download. O que os testes precisam não é de um jogo — é de um arquivo
 * com o formato certo, e formato se constrói.
 *
 * Os bytes são determinísticos de propósito. Conteúdo aleatório faria o
 * cabeçalho de SNES ser reconhecido por sorte de vez em quando (a regra é
 * aritmética sobre dois inteiros de 16 bits), e teste que passa por
 * coincidência é pior que teste que não existe.
 */
import { TAMANHO_DO_CABECALHO_DE_COPIADOR } from '../../src/modules/library/domain/verificacao-de-rom.js';

/** Onde fica o bloco de 32 bytes do cartucho num LoROM. */
const CABECALHO_LOROM = 0x7fc0;

export interface OpcoesDaRomDeSnes {
  /** Prefixa os 512 bytes do copiador, como faz metade dos dumps por aí. */
  comCabecalhoDeCopiador?: boolean;
  /**
   * Bytes gravados num pedaço do arquivo que nenhuma checagem lê.
   *
   * Serve ao teste de integração: o objeto promovido mora em `roms/<sha256>`,
   * que é caminho compartilhado no bucket de desenvolvimento. Conteúdo único
   * por execução é o que impede duas rodadas simultâneas de disputarem — e de
   * uma apagar, na limpeza, o objeto que a outra ainda usa.
   */
  marcador?: Uint8Array;
  /** Tamanho da ROM em si, sem o cabeçalho de copiador. */
  tamanho?: number;
}

/** Longe do cabeçalho do cartucho (0x7FC0) e de toda assinatura conhecida. */
const OFFSET_DO_MARCADOR = 0x200;

/**
 * Uma ROM de SNES que o verificador aceita.
 *
 * O que a faz ser aceita é o par `checksum`/`complemento` no cabeçalho do
 * cartucho: o console grava os dois, e a soma deles é `0xFFFF`. É a única
 * marca que o formato tem, e é ela que o servidor procura.
 */
export function romDeSnes(opcoes: OpcoesDaRomDeSnes = {}): Uint8Array {
  const tamanho = opcoes.tamanho ?? 64 * 1024;
  const corpo = new Uint8Array(tamanho).fill(0x5a);
  if (opcoes.marcador !== undefined) corpo.set(opcoes.marcador, OFFSET_DO_MARCADOR);

  const checksum = 0xabcd;
  const complemento = 0xffff - checksum;
  escreverUint16(corpo, CABECALHO_LOROM + 0x1c, complemento);
  escreverUint16(corpo, CABECALHO_LOROM + 0x1e, checksum);

  if (opcoes.comCabecalhoDeCopiador !== true) return corpo;

  // O cabeçalho do copiador é lixo do ponto de vista do jogo: os dois
  // primeiros bytes são o tamanho em blocos e o resto é preenchimento.
  const comHeader = new Uint8Array(TAMANHO_DO_CABECALHO_DE_COPIADOR + corpo.byteLength);
  comHeader[0] = tamanho / 8192;
  comHeader.set(corpo, TAMANHO_DO_CABECALHO_DE_COPIADOR);
  return comHeader;
}

/** Texto puro. Não é ROM de console nenhum, e nenhum cabeçalho vai bater. */
export function naoEUmaRom(tamanho = 64 * 1024): Uint8Array {
  return new Uint8Array(tamanho).fill(0x41);
}

/** Um ZIP — o engano mais comum de quem baixou ROM de arquivo antigo. */
export function arquivoZip(tamanho = 64 * 1024): Uint8Array {
  const bytes = new Uint8Array(tamanho).fill(0x41);
  bytes.set([0x50, 0x4b, 0x03, 0x04], 0);
  return bytes;
}

function escreverUint16(bytes: Uint8Array, offset: number, valor: number): void {
  bytes[offset] = valor & 0xff;
  bytes[offset + 1] = (valor >> 8) & 0xff;
}
