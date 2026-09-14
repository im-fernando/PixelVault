#!/usr/bin/env node
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';

const raiz = fileURLToPath(new URL('../../../', import.meta.url));
const pacote = path.join(raiz, 'packages/emulator-runtime');
const servidor = http.createServer((req, res) => {
  const rota = (req.url ?? '/').split('?')[0];
  if (rota === '/fixture.iso' || rota === '/fixture.chd') {
    if (!process.env.PS1_ROM) {
      res.writeHead(404).end();
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    fs.createReadStream(process.env.PS1_ROM).pipe(res);
    return;
  }
  const base = rota.startsWith('/runtime/')
    ? path.join(pacote, 'dist')
    : rota.startsWith('/contracts/')
      ? path.join(raiz, 'packages/contracts/dist')
      : rota.startsWith('/emulator/')
        ? path.join(raiz, 'apps/web/public')
        : path.join(pacote, 'verificacao');
  const relative = rota.replace(/^\/(runtime|contracts)\//, '/');
  const arquivo = path.resolve(base, '.' + (relative === '/' ? '/ps1.html' : relative));
  if (!arquivo.startsWith(base + path.sep) || !fs.existsSync(arquivo)) {
    res.writeHead(404).end();
    return;
  }
  res.setHeader(
    'Content-Type',
    arquivo.endsWith('.html')
      ? 'text/html'
      : /\.(m?js)$/.test(arquivo)
        ? 'text/javascript'
        : 'application/wasm',
  );
  fs.createReadStream(arquivo).pipe(res);
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
let browser;
try {
  browser = await chromium.launch({
    executablePath:
      process.env.CHROME ??
      `${process.env.HOME}/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome`,
    args: [
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
      '--mute-audio',
    ],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => process.stderr.write(e.message + '\n'));
  page.on('console', (m) => {
    if (process.env.PS1_DEBUG || m.type() === 'error') process.stderr.write(m.text() + '\n');
  });
  await page.goto(`http://127.0.0.1:${servidor.address().port}/`);
  await page.waitForFunction(() => window.pronto);
  const fixture = process.env.PS1_ROM ? `/fixture${path.extname(process.env.PS1_ROM)}` : undefined;
  await page.evaluate((url) => window.abrir(url), fixture);
  await page.click('canvas');
  await page.evaluate(() => window.adapter.audio.unlock());
  await page.waitForTimeout(3000);
  const resultado = await page.evaluate(async () => {
    const a = window.adapter;
    a.pause();
    const antes = await a.captureFrame();
    const bitmap = await createImageBitmap(antes);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0);
    bitmap.close();
    const pixel = [...ctx.getImageData(100, 100, 1, 1).data];
    const state = await a.exportState();
    const sram = await a.exportSram();
    await a.importState(state);
    const depois = a.status;
    sram[8192] = 0x5a;
    await a.importSram(sram);
    const restaurado = await a.exportSram();
    await a.destroy();
    return {
      pixel,
      picoAudio: window.picoAudio,
      contextosFechados: window.contextos.every((c) => c.state === 'closed'),
      antes: antes.size,
      state: state.length,
      sram: sram.length,
      assinatura: [...sram.slice(0, 2)],
      memoryCardIgual: sram.every((v, i) => restaurado[i] === v),
      depois,
      final: a.status,
      erros: window.eventos,
      fps: window.fps,
    };
  });
  process.stdout.write(JSON.stringify(resultado, null, 2) + '\n');
  assert.ok(resultado.pixel[0] > 100, `homebrew não desenhou: ${resultado.pixel}`);
  assert.ok(resultado.picoAudio > 0.001);
  assert.equal(resultado.contextosFechados, true);
  assert.ok(resultado.antes > 100);
  assert.ok(resultado.state > 1000);
  assert.equal(resultado.sram, 131072);
  assert.deepEqual(resultado.assinatura, [77, 67]);
  assert.equal(resultado.memoryCardIgual, true);
  assert.equal(resultado.depois, 'paused');
  assert.equal(resultado.final, 'destroyed');
  assert.deepEqual(resultado.erros, []);
} finally {
  await browser?.close();
  await new Promise((r) => servidor.close(r));
}
