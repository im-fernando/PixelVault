import { describe, expect, it, vi } from 'vitest';
import {
  THUMBNAIL_PLACEHOLDER,
  captureThumbnail,
  resizeThumbnail,
  revokeThumbnailUrl,
  thumbnailUrl,
} from './thumbnail.js';

const QUADRO = new Blob(['<svg/>'], { type: 'image/svg+xml' });

describe('captureThumbnail', () => {
  it('devolve o quadro do emulador', async () => {
    const miniatura = await captureThumbnail({ captureFrame: () => Promise.resolve(QUADRO) });
    expect(await miniatura?.text()).toBe('<svg/>');
  });

  /**
   * Miniatura é enfeite: o save state que ela acompanha não pode falhar por
   * causa dela. Falhar aqui vira `null`, nunca exceção.
   */
  it('devolve null quando o core não consegue capturar', async () => {
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const miniatura = await captureThumbnail({
      captureFrame: () => Promise.reject(new Error('contexto WebGL perdido')),
    });

    expect(miniatura).toBeNull();
    expect(aviso).toHaveBeenCalled();
    aviso.mockRestore();
  });
});

describe('resizeThumbnail', () => {
  /**
   * Em Node não existe `OffscreenCanvas`. O redimensionamento de verdade só é
   * exercitado no navegador; o que este teste garante é que a ausência da API
   * degrada para o quadro original em vez de estourar.
   */
  it('devolve o quadro original onde não há OffscreenCanvas', async () => {
    expect(typeof OffscreenCanvas).toBe('undefined');
    expect(await resizeThumbnail(QUADRO)).toBe(QUADRO);
  });
});

describe('placeholder da galeria', () => {
  it('slot sem miniatura recebe o placeholder, não uma URL quebrada', () => {
    expect(thumbnailUrl(null)).toBe(THUMBNAIL_PLACEHOLDER);
    expect(THUMBNAIL_PLACEHOLDER.startsWith('data:image/svg+xml,')).toBe(true);
  });

  it('revogar o placeholder não chama revokeObjectURL', () => {
    const revogar = vi.fn();
    vi.stubGlobal('URL', { ...URL, revokeObjectURL: revogar });
    revokeThumbnailUrl(THUMBNAIL_PLACEHOLDER);
    expect(revogar).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
