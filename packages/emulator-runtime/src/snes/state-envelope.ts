import { StateIncompatibleError } from '../adapter/errors.js';

/**
 * Envelope que embrulha o save state cru do RetroArch.
 *
 * **Por que existe:** o `.state` do RetroArch é opaco e não carrega nada que
 * diga qual core o gravou — o cabeçalho é só `#RZIPv1`. Carregar um save de
 * outro build no `LOAD_STATE` não devolve erro: o RetroArch registra a falha no
 * log dele e a máquina fica num estado indefinido. Para a M5, "save state
 * incompatível" precisa ser um erro que a UI mostra, e não uma tela travada.
 *
 * O envelope resolve isso carregando `systemId`, `coreVersion` e a identidade
 * da ROM ao lado dos bytes. É o mesmo princípio do `serializeFakeState` do
 * adapter falso, e a razão de o contrato exigir que `coreVersion` identifique
 * core **e** versão.
 *
 * O custo é que os bytes que saem de `exportState` não são um `.state` que o
 * RetroArch de desktop abre. Isso é aceitável: o save state do PixelVault
 * atravessa o nosso servidor e volta para o nosso player.
 */
export interface EnvelopeDeEstado {
  /** `string`, e não `SystemId`: o que veio de um arquivo é texto até ser comparado. */
  readonly systemId: string;
  readonly coreVersion: string;
  readonly romId: string;
  /** O `.state` como o RetroArch o gravou. */
  readonly estado: Uint8Array;
}

/** "PVST" — PixelVault STate. */
const ASSINATURA = 'PVST';
const VERSAO_DO_FORMATO = 1;
const TAMANHO_MINIMO = ASSINATURA.length + 1;

export function empacotarEstado(envelope: EnvelopeDeEstado): Uint8Array {
  const codificador = new TextEncoder();
  const blocos = [
    codificador.encode(envelope.systemId),
    codificador.encode(envelope.coreVersion),
    codificador.encode(envelope.romId),
    envelope.estado,
  ];

  const total = TAMANHO_MINIMO + blocos.reduce((soma, bloco) => soma + 4 + bloco.byteLength, 0);
  const bytes = new Uint8Array(total);
  const visao = new DataView(bytes.buffer);

  let offset = 0;
  for (let i = 0; i < ASSINATURA.length; i += 1) {
    visao.setUint8(offset + i, ASSINATURA.charCodeAt(i));
  }
  offset += ASSINATURA.length;
  visao.setUint8(offset, VERSAO_DO_FORMATO);
  offset += 1;
  for (const bloco of blocos) {
    visao.setUint32(offset, bloco.byteLength);
    bytes.set(bloco, offset + 4);
    offset += 4 + bloco.byteLength;
  }
  return bytes;
}

export function desempacotarEstado(dados: Uint8Array): EnvelopeDeEstado {
  if (dados.byteLength < TAMANHO_MINIMO) {
    throw new StateIncompatibleError('save state truncado');
  }
  const visao = new DataView(dados.buffer, dados.byteOffset, dados.byteLength);

  let assinatura = '';
  for (let i = 0; i < ASSINATURA.length; i += 1) {
    assinatura += String.fromCharCode(visao.getUint8(i));
  }
  if (assinatura !== ASSINATURA) {
    throw new StateIncompatibleError('não é um save state do PixelVault');
  }

  const versao = visao.getUint8(ASSINATURA.length);
  if (versao !== VERSAO_DO_FORMATO) {
    throw new StateIncompatibleError(`formato versão ${versao}, esperado ${VERSAO_DO_FORMATO}`);
  }

  const decodificador = new TextDecoder();
  let offset = TAMANHO_MINIMO;
  const blocos: Uint8Array[] = [];
  for (let i = 0; i < 4; i += 1) {
    if (offset + 4 > dados.byteLength) {
      throw new StateIncompatibleError('save state truncado');
    }
    const tamanho = visao.getUint32(offset);
    const inicio = offset + 4;
    const fim = inicio + tamanho;
    if (fim > dados.byteLength) {
      throw new StateIncompatibleError('save state truncado');
    }
    blocos.push(dados.subarray(inicio, fim));
    offset = fim;
  }

  const [sistema, core, rom, estado] = blocos as [Uint8Array, Uint8Array, Uint8Array, Uint8Array];
  return {
    systemId: decodificador.decode(sistema),
    coreVersion: decodificador.decode(core),
    romId: decodificador.decode(rom),
    estado: estado.slice(),
  };
}
