// @vitest-environment jsdom
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, expect, it, vi } from 'vitest';
import { guardarBiosPs1, lerBiosPs1, validarBiosPs1 } from './ps1-bios.js';
afterEach(() => vi.unstubAllGlobals());
it('valida estrutura e guarda a BIOS localmente, sem fetch', async () => {
  vi.stubGlobal('indexedDB', new IDBFactory());
  const fetch = vi.fn();
  vi.stubGlobal('fetch', fetch);
  const bytes = new Uint8Array(512 * 1024);
  bytes.set(new TextEncoder().encode('Sony Computer Entertainment'), 100);
  expect(() => validarBiosPs1('jogo.bin', bytes)).toThrow('BIOS inválida');
  expect(() => validarBiosPs1('scph5501.bin', new Uint8Array(512 * 1024))).toThrow();
  expect(await guardarBiosPs1({ fileName: 'scph5501.bin', fileContent: bytes })).toBe(true);
  expect((await lerBiosPs1())?.fileName).toBe('scph5501.bin');
  vi.resetModules();
  const recarregado = await import('./ps1-bios.js');
  const persistidos = (await recarregado.lerBiosPs1())?.fileContent;
  expect(persistidos?.byteLength).toBe(bytes.byteLength);
  expect(persistidos?.every((valor, indice) => valor === bytes[indice])).toBe(true);
  await recarregado.guardarBiosPs1(null);
  expect(fetch).not.toHaveBeenCalled();
  await guardarBiosPs1(null);
  expect(await lerBiosPs1()).toBeNull();
});
it('mantém escolha da sessão quando IndexedDB está indisponível', async () => {
  vi.stubGlobal('indexedDB', undefined);
  expect(await guardarBiosPs1(null)).toBe(false);
  expect(await lerBiosPs1()).toBeNull();
});
