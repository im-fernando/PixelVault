#!/usr/bin/env node
/** Vite precisa estar em execução. API simulada, core/React/roteador reais. */
import { chromium } from 'playwright-core';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { criarHomebrewPs1 } from './ps1-homebrew.mjs';
const base = process.env.WEB_URL ?? 'http://127.0.0.1:5174';
const id = '11111111-1111-4111-8111-111111111111';
const rom = Buffer.from(criarHomebrewPs1());
const hash = createHash('sha256').update(rom).digest('hex');
const item = {
  id,
  title: 'PixelVault PS1 Homebrew',
  systemId: 'ps1',
  gameId: null,
  coverUrl: null,
  fileName: 'pixelvault.exe',
  sizeBytes: rom.length,
  sha256: hash,
  isFavorite: false,
  uploadedAt: '2026-09-14T00:00:00.000Z',
};
const browser = await chromium.launch({
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
let page;
try {
  page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const erros = [];
  page.on('pageerror', (e) => {
    erros.push(e.message);
    console.error(e.message);
  });
  await page.addInitScript(() => {
    window.pad = {
      index: 0,
      id: 'Xbox Controller',
      mapping: 'standard',
      connected: true,
      axes: [0, 0],
      buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })),
    };
    window.GamepadEvent = class extends Event {
      constructor(type, init) {
        super(type);
        this.gamepad = init.gamepad;
      }
    };
    Object.defineProperty(navigator, 'getGamepads', { value: () => [window.pad] });
  });
  await page.route('**/fixture.exe', (route) =>
    route.fulfill({ body: rom, contentType: 'application/octet-stream' }),
  );
  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    let body;
    if (url.pathname.endsWith('/auth/me'))
      body = {
        user: {
          id: '22222222-2222-4222-8222-222222222222',
          email: 'ps1@example.com',
          handle: 'ps1teste',
          displayName: 'Teste PS1',
          publicProfile: true,
        },
      };
    else if (url.pathname.endsWith('/download'))
      body = {
        url: `${base}/fixture.exe`,
        expiresInSeconds: 300,
        sha256: hash,
        sizeBytes: rom.length,
        fileName: 'pixelvault.exe',
      };
    else if (url.pathname === '/api/library/roms') body = [item];
    else if (url.pathname.includes('/progress/sram/')) body = { status: 'sem-save' };
    else if (url.pathname.includes('/progress/state/')) body = { slots: [] };
    else if (url.pathname.includes('/heartbeat')) body = { status: 'registrado' };
    else body = {};
    await route.fulfill({ json: body });
  });
  const controle = async (...indices) => {
    await page.evaluate(
      (indices) =>
        window.pad.buttons.forEach((b, i) => {
          b.pressed = indices.includes(i);
          b.value = b.pressed ? 1 : 0;
        }),
      indices,
    );
    await page.waitForTimeout(100);
  };
  await page.goto(`${base}/console/${id}`);
  await page.getByRole('button', { name: 'Iniciar com BIOS HLE' }).waitFor();
  await page.screenshot({ path: '/tmp/pixelvault-ps1-setup.png' });
  await page.getByRole('button', { name: 'Iniciar com BIOS HLE' }).click();
  await page.getByRole('button', { name: 'Abrir menu do console' }).waitFor({ timeout: 30000 });
  await controle(4, 5);
  assert.equal(await page.getByRole('dialog').count(), 0);
  await controle();
  await controle(8, 9);
  await controle();
  await page.getByRole('dialog', { name: 'Menu do console' }).waitFor();
  await page.getByRole('button', { name: 'Imagem e som', exact: true }).click();
  await page.getByRole('slider', { name: 'Volume do jogo' }).focus();
  await controle(14);
  await controle();
  assert.equal(await page.getByRole('slider').inputValue(), '75');
  await page.getByRole('button', { name: 'Estados salvos', exact: true }).click();
  await page.getByRole('button', { name: 'Salvar no slot 1' }).click();
  await page.getByText('Estado salvo no slot 1.', { exact: true }).waitFor();
  await page.screenshot({ path: '/tmp/pixelvault-ps1-saves.png' });
  await page.getByRole('button', { name: 'Sua sessão', exact: true }).click();
  await page.getByRole('button', { name: 'Voltar ao console', exact: true }).click();
  await page
    .getByRole('alertdialog')
    .getByRole('button', { name: 'Voltar ao console', exact: true })
    .focus();
  await controle(0);
  await page.waitForURL((url) => url.pathname === '/console');
  await page.waitForTimeout(600); // Confirmação continua segurada durante a troca de rota.
  assert.equal(new URL(page.url()).pathname, '/console');
  await controle();
  await page.screenshot({ path: '/tmp/pixelvault-ps1-console.png' });
  assert.deepEqual(erros, []);
  process.stdout.write(
    'PS1: preparação, boot real, joystick, volume, save e saída com botão segurado passaram.\n',
  );
} catch (e) {
  await page?.screenshot({ path: '/tmp/pixelvault-ps1-ui-erro.png' });
  console.error(await page?.locator('body').innerText());
  throw e;
} finally {
  await browser.close();
}
