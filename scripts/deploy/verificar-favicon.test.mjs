import assert from 'node:assert/strict';
import { test } from 'node:test';
import { verificarFavicon } from './verificar-favicon.mjs';

const svg = () =>
  new Response('<svg xmlns="http://www.w3.org/2000/svg"></svg>', {
    headers: { 'content-type': 'image/svg+xml' },
  });
const html = () =>
  new Response('<!doctype html><html></html>', { headers: { 'content-type': 'text/html' } });

test('aguarda HTML transitório e valida o SVG, sem reutilizar a URL em cache', async () => {
  const urls = [];
  const pausas = [];
  await verificarFavicon('https://example.com', {
    buscar: async (url, opcoes) => {
      urls.push(String(url));
      assert.equal(opcoes.cache, 'no-store');
      assert.ok(opcoes.signal instanceof AbortSignal);
      return urls.length < 3 ? html() : svg();
    },
    esperar: async (tempo) => {
      pausas.push(tempo);
    },
    avisar: () => {},
  });
  assert.equal(new Set(urls).size, 3);
  assert.deepEqual(pausas, [5000, 5000]);
});

test('não mascara um favicon ausente após o limite de tentativas', async () => {
  let chamadas = 0;
  await assert.rejects(
    verificarFavicon('https://example.com', {
      buscar: async () => {
        chamadas++;
        return html();
      },
      esperar: async () => {},
      avisar: () => {},
      tentativas: 3,
    }),
    (erro) => /após 3 tentativas/.test(erro.message) && /text\/html/.test(erro.cause.message),
  );
  assert.equal(chamadas, 3);
});

test('recusa conteúdo HTML mesmo com o tipo SVG e recusa status de erro', async () => {
  for (const resposta of [
    new Response('<html></html>', { headers: { 'content-type': 'image/svg+xml' } }),
    new Response('<svg></svg>', { status: 404, headers: { 'content-type': 'image/svg+xml' } }),
  ]) {
    await assert.rejects(
      verificarFavicon('https://example.com', {
        buscar: async () => resposta,
        tentativas: 1,
      }),
      /após 1 tentativas/,
    );
  }
});

test('repete uma falha de rede e termina assim que o SVG está disponível', async () => {
  let chamadas = 0;
  await verificarFavicon('https://example.com', {
    buscar: async () => {
      if (++chamadas === 1) throw new TypeError('fetch failed');
      return svg();
    },
    esperar: async () => {},
    avisar: () => {},
  });
  assert.equal(chamadas, 2);
});
