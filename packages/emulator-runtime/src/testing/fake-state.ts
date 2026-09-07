import { StateIncompatibleError } from '../adapter/errors.js';

/**
 * Máquina do adapter falso: o mínimo que precisa sobreviver a um save state.
 *
 * `systemId` é `string` e não `SystemId` de propósito — o que vem de um arquivo
 * ainda não é um console conhecido, é texto até ser comparado.
 */
export interface FakeMachineState {
  readonly systemId: string;
  readonly coreVersion: string;
  /** Identidade da ROM carregada. Save state de outra ROM é incompatível. */
  readonly romId: string;
  readonly frame: number;
  readonly sram: Uint8Array;
}

/** "PVFK" — PixelVault Fake. Save state real também começa por assinatura. */
const ASSINATURA = 'PVFK';
const VERSAO_DO_FORMATO = 1;
const TAMANHO_MINIMO = ASSINATURA.length + 1 + 4;

/**
 * Serializa a máquina num formato determinístico e autodescritivo.
 *
 * Autodescritivo importa: é o que permite `importState` recusar um save de
 * outro console, de outra versão do core ou de outra ROM — os três casos que a
 * UI precisa saber distinguir de "arquivo corrompido".
 */
export function serializeFakeState(estado: FakeMachineState): Uint8Array {
  const codificador = new TextEncoder();
  const sistema = codificador.encode(estado.systemId);
  const core = codificador.encode(estado.coreVersion);
  const rom = codificador.encode(estado.romId);

  const total =
    TAMANHO_MINIMO +
    4 +
    sistema.byteLength +
    4 +
    core.byteLength +
    4 +
    rom.byteLength +
    4 +
    estado.sram.byteLength;

  const bytes = new Uint8Array(total);
  const visao = new DataView(bytes.buffer);

  let offset = 0;
  for (let i = 0; i < ASSINATURA.length; i += 1) {
    visao.setUint8(offset + i, ASSINATURA.charCodeAt(i));
  }
  offset += ASSINATURA.length;
  visao.setUint8(offset, VERSAO_DO_FORMATO);
  offset += 1;
  visao.setUint32(offset, estado.frame);
  offset += 4;
  offset = escreverBloco(visao, bytes, offset, sistema);
  offset = escreverBloco(visao, bytes, offset, core);
  offset = escreverBloco(visao, bytes, offset, rom);
  escreverBloco(visao, bytes, offset, estado.sram);

  return bytes;
}

export function deserializeFakeState(dados: Uint8Array): FakeMachineState {
  if (dados.byteLength < TAMANHO_MINIMO) {
    throw new StateIncompatibleError('save state truncado');
  }
  const visao = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);
  const decodificador = new TextDecoder();

  let offset = 0;
  let assinatura = '';
  for (let i = 0; i < ASSINATURA.length; i += 1) {
    assinatura += String.fromCharCode(visao.getUint8(offset + i));
  }
  if (assinatura !== ASSINATURA) {
    throw new StateIncompatibleError('não é um save state deste core');
  }
  offset += ASSINATURA.length;

  const versao = visao.getUint8(offset);
  offset += 1;
  if (versao !== VERSAO_DO_FORMATO) {
    throw new StateIncompatibleError(`formato versão ${versao}, esperado ${VERSAO_DO_FORMATO}`);
  }

  try {
    const frame = visao.getUint32(offset);
    offset += 4;
    const sistema = lerBloco(visao, dados, offset);
    const core = lerBloco(visao, dados, sistema.offset);
    const rom = lerBloco(visao, dados, core.offset);
    const sram = lerBloco(visao, dados, rom.offset);

    return {
      systemId: decodificador.decode(sistema.conteudo),
      coreVersion: decodificador.decode(core.conteudo),
      romId: decodificador.decode(rom.conteudo),
      frame,
      sram: sram.conteudo.slice(),
    };
  } catch (erro) {
    if (erro instanceof StateIncompatibleError) {
      throw erro;
    }
    throw new StateIncompatibleError('save state truncado', { cause: erro });
  }
}

function escreverBloco(
  visao: DataView,
  bytes: Uint8Array,
  offset: number,
  conteudo: Uint8Array,
): number {
  visao.setUint32(offset, conteudo.byteLength);
  bytes.set(conteudo, offset + 4);
  return offset + 4 + conteudo.byteLength;
}

function lerBloco(
  visao: DataView,
  bytes: Uint8Array,
  offset: number,
): { readonly conteudo: Uint8Array; readonly offset: number } {
  const tamanho = visao.getUint32(offset);
  const inicio = offset + 4;
  const fim = inicio + tamanho;
  if (fim > bytes.byteLength) {
    throw new StateIncompatibleError('save state truncado');
  }
  return { conteudo: bytes.subarray(inicio, fim), offset: fim };
}

/**
 * SRAM inicial determinística a partir da identidade da ROM.
 *
 * Determinismo é o ponto do adapter falso: a mesma ROM produz sempre os mesmos
 * bytes, então um teste consegue afirmar round-trip por igualdade em vez de
 * por "não estourou".
 */
export function initialSram(romId: string, byteLength: number): Uint8Array {
  const saida = new Uint8Array(byteLength);
  let estado = fnv1a(romId) || 1;
  for (let i = 0; i < byteLength; i += 1) {
    estado = (Math.imul(estado, 1664525) + 1013904223) >>> 0;
    saida[i] = estado >>> 24;
  }
  return saida;
}

export function fnv1a(texto: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < texto.length; i += 1) {
    hash ^= texto.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
