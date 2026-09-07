/** O mínimo que a miniatura precisa do emulador: um quadro. */
export interface FrameSource {
  captureFrame(): Promise<Blob>;
}

export interface ThumbnailOptions {
  /** Largura máxima em pixels. A altura acompanha a proporção do quadro. */
  readonly maxWidth?: number;
  readonly type?: 'image/webp' | 'image/jpeg';
  readonly quality?: number;
}

/**
 * 256 px é a largura nativa de um quadro de SNES: acima disso a miniatura só
 * cresce em bytes, e ela é gravada junto de todo save state.
 */
export const THUMBNAIL_DEFAULTS = Object.freeze({
  maxWidth: 256,
  type: 'image/webp',
  quality: 0.8,
} satisfies Required<ThumbnailOptions>);

/**
 * Imagem para o slot que não tem miniatura.
 *
 * É `data:` e não arquivo em `public/` de propósito: a galeria não pode
 * depender de uma requisição de rede para desenhar um placeholder, e um 404 no
 * lugar dele deixaria o slot com o ícone de imagem quebrada.
 */
export const THUMBNAIL_PLACEHOLDER = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="224" viewBox="0 0 256 224">' +
    '<rect width="256" height="224" fill="#16161f"/>' +
    '<rect x="86" y="88" width="84" height="48" rx="12" fill="none" stroke="#3c3c50" ' +
    'stroke-width="4"/><rect x="102" y="106" width="14" height="4" fill="#3c3c50"/>' +
    '<rect x="107" y="101" width="4" height="14" fill="#3c3c50"/>' +
    '<circle cx="146" cy="108" r="5" fill="#3c3c50"/>' +
    '<text x="128" y="172" fill="#5a5a72" font-family="system-ui, sans-serif" ' +
    'font-size="14" text-anchor="middle">sem miniatura</text></svg>',
)}`;

/**
 * Miniatura do quadro atual, ou `null`.
 *
 * `null` é resultado normal, não exceção: core sem `captureFrame` útil,
 * navegador sem `OffscreenCanvas`, quadro que não decodifica. Miniatura é
 * enfeite caro de perder e barato de não ter — **nunca** pode derrubar o save
 * state que ela acompanha, então tudo aqui é engolido e vira `null`.
 */
export async function captureThumbnail(
  source: FrameSource,
  options: ThumbnailOptions = {},
): Promise<Blob | null> {
  try {
    const quadro = await source.captureFrame();
    return await resizeThumbnail(quadro, options);
  } catch (erro) {
    console.warn('[player/storage] não consegui gerar a miniatura do save state', erro);
    return null;
  }
}

/**
 * Redimensiona o quadro para caber em `maxWidth`.
 *
 * Sem `createImageBitmap`/`OffscreenCanvas` — Node nos testes, navegador
 * antigo, worker sem suporte — devolve o quadro original. Guardar 100 KB de
 * PNG é pior que guardar 6 KB de WebP e melhor que não ter imagem nenhuma.
 */
export async function resizeThumbnail(quadro: Blob, options: ThumbnailOptions = {}): Promise<Blob> {
  const { maxWidth, type, quality } = { ...THUMBNAIL_DEFAULTS, ...options };
  if (!podeRedimensionar()) {
    return quadro;
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(quadro);
    const escala = Math.min(1, maxWidth / bitmap.width);
    const largura = Math.max(1, Math.round(bitmap.width * escala));
    const altura = Math.max(1, Math.round(bitmap.height * escala));

    const canvas = new OffscreenCanvas(largura, altura);
    const contexto = canvas.getContext('2d');
    if (contexto === null) {
      return quadro;
    }
    contexto.drawImage(bitmap, 0, 0, largura, altura);
    return await canvas.convertToBlob({ type, quality });
  } finally {
    bitmap?.close();
  }
}

/**
 * URL pronta para o `src` de um `<img>`, com placeholder quando não há imagem.
 *
 * Quem chama é obrigado a devolver a URL para `revokeThumbnailUrl` quando o
 * elemento sair da tela: `createObjectURL` segura o Blob vivo até ser
 * revogado, e uma galeria que remonta a cada save vaza uma imagem por save.
 */
export function thumbnailUrl(thumbnail: Blob | null): string {
  return thumbnail === null ? THUMBNAIL_PLACEHOLDER : URL.createObjectURL(thumbnail);
}

/** Contraparte de `thumbnailUrl`. Ignora o placeholder, que não é object URL. */
export function revokeThumbnailUrl(url: string): void {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
}

function podeRedimensionar(): boolean {
  return typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function';
}
