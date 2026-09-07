import { RomInvalidError } from './errors.js';

/**
 * Metadados que acompanham a ROM sem obrigar a lê-la.
 *
 * `fileName` não é enfeite: vários cores decidem o que carregar pela extensão
 * (`.sfc`, `.smc`, `.gb`), e sem ele o adapter precisaria adivinhar.
 */
export interface RomSourceMeta {
  readonly fileName?: string;
  /** Tamanho conhecido, quando a origem sabe informar sem ler o conteúdo. */
  readonly byteLength?: number;
}

export interface RomBytesSource extends RomSourceMeta {
  readonly kind: 'bytes';
  readonly data: Uint8Array;
}

export interface RomBlobSource extends RomSourceMeta {
  readonly kind: 'blob';
  readonly blob: Blob;
}

export interface RomUrlSource extends RomSourceMeta {
  readonly kind: 'url';
  readonly url: string;
}

/**
 * De onde vêm os bytes da ROM.
 *
 * É uma **fonte**, não um buffer, e isso é decisão consciente. `Uint8Array`
 * resolve SNES (4 MB) e quebra em PlayStation (700 MB residentes na memória da
 * aba, mais a cópia que o core faz do outro lado do WASM). Descrever a origem
 * em vez de carregar o conteúdo deixa o adapter escolher: ler em pedaços,
 * deixar o navegador paginar o `Blob` que veio do OPFS, ou entregar a URL
 * direto para o core baixar por streaming.
 *
 * Repare no que o contrato **não** tem: nenhum método que devolva a ROM
 * inteira. Quem precisar de todos os bytes consome o stream e assume o custo
 * explicitamente — o atrito é proposital.
 */
export type RomSource = RomBytesSource | RomBlobSource | RomUrlSource;

export function romFromBytes(data: Uint8Array, meta: RomSourceMeta = {}): RomBytesSource {
  return { ...meta, kind: 'bytes', data, byteLength: data.byteLength };
}

export function romFromBlob(blob: Blob, meta: RomSourceMeta = {}): RomBlobSource {
  return { ...meta, kind: 'blob', blob, byteLength: blob.size };
}

export function romFromUrl(url: string, meta: RomSourceMeta = {}): RomUrlSource {
  return { ...meta, kind: 'url', url };
}

/** Rótulo curto e estável para log e mensagem de erro. Nunca contém a ROM. */
export function describeRomSource(source: RomSource): string {
  switch (source.kind) {
    case 'bytes':
      return source.fileName ?? `bytes:${source.data.byteLength}`;
    case 'blob':
      return source.fileName ?? `blob:${source.blob.size}:${source.blob.type || 'sem-tipo'}`;
    case 'url':
      return source.fileName ?? source.url;
  }
}

/**
 * Abre a ROM como stream, sem materializar o conteúdo.
 *
 * É o caminho preguiçoso: o adapter lê no ritmo que aguenta e o navegador
 * decide o que fica em memória.
 */
export async function openRomStream(source: RomSource): Promise<ReadableStream<Uint8Array>> {
  switch (source.kind) {
    case 'bytes': {
      const { data } = source;
      return new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(data);
          controller.close();
        },
      });
    }
    case 'blob':
      return source.blob.stream();
    case 'url': {
      const resposta = await fetch(source.url);
      if (!resposta.ok) {
        throw new RomInvalidError(`HTTP ${resposta.status} ao ler ${source.url}`);
      }
      if (resposta.body === null) {
        throw new RomInvalidError(`resposta sem corpo em ${source.url}`);
      }
      return resposta.body;
    }
  }
}

/**
 * Lê só o começo da ROM — o suficiente para reconhecer cabeçalho e decidir o
 * core, sem pagar o preço do arquivo inteiro.
 *
 * Na origem `url` usa `Range` e cancela o resto do corpo: servidor que ignora
 * `Range` mandaria a ROM completa, e cancelar é o que impede os 700 MB de
 * atravessarem a rede por causa de 16 bytes.
 */
export async function readRomHeader(source: RomSource, byteLength: number): Promise<Uint8Array> {
  if (byteLength <= 0) {
    return new Uint8Array(0);
  }
  switch (source.kind) {
    case 'bytes':
      return source.data.slice(0, byteLength);
    case 'blob':
      return new Uint8Array(await source.blob.slice(0, byteLength).arrayBuffer());
    case 'url':
      return lerInicioDaUrl(source.url, byteLength);
  }
}

async function lerInicioDaUrl(url: string, byteLength: number): Promise<Uint8Array> {
  const resposta = await fetch(url, { headers: { Range: `bytes=0-${byteLength - 1}` } });
  if (!resposta.ok) {
    throw new RomInvalidError(`HTTP ${resposta.status} ao ler o cabeçalho de ${url}`);
  }
  const corpo = resposta.body;
  if (corpo === null) {
    throw new RomInvalidError(`resposta sem corpo em ${url}`);
  }

  const leitor = corpo.getReader();
  const pedacos: Uint8Array[] = [];
  let lidos = 0;
  try {
    while (lidos < byteLength) {
      const { done, value } = await leitor.read();
      if (done || value === undefined) {
        break;
      }
      pedacos.push(value);
      lidos += value.byteLength;
    }
  } finally {
    await leitor.cancel().catch(() => undefined);
  }
  return concatenar(pedacos, Math.min(lidos, byteLength));
}

function concatenar(pedacos: readonly Uint8Array[], total: number): Uint8Array {
  const saida = new Uint8Array(total);
  let offset = 0;
  for (const pedaco of pedacos) {
    if (offset >= total) {
      break;
    }
    const fatia = pedaco.subarray(0, total - offset);
    saida.set(fatia, offset);
    offset += fatia.byteLength;
  }
  return saida;
}
