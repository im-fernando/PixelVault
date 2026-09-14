import { expect, it } from 'vitest';
import { urlsCandidatasDeLombada } from './nomes-no-libretro.js';

it('preserva edição, ponto e disco do arquivo antes de tentar o título limpo', () => {
  const nome = 'Resident Evil 2 - Dual Shock Ver. (USA) (Disc 1)';
  const urls = urlsCandidatasDeLombada(nome.replace('Ver.', 'Ver'), 'ps1', `${nome}.chd`);
  expect(decodeURIComponent(urls[0] ?? '')).toBe(
    `https://thumbnails.libretro.com/Sony - PlayStation/Named_Boxarts/${nome}.png`,
  );
  expect(urls.length).toBeGreaterThan(1);
});
