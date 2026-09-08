import { describe, expect, it } from 'vitest';
import { nomeDeArquivoNoLibretro, urlsCandidatasDeCapa } from './nomes-no-libretro.js';

const BASE = 'https://thumbnails.libretro.com';

describe('nomeDeArquivoNoLibretro', () => {
  it('troca os caracteres reservados do libretro por sublinhado', () => {
    // A regra é do libretro, não nossa: `&*/:`<>?\|` viram `_` no nome do
    // arquivo. Ver docs.libretro.com/guides/roms-playlists-thumbnails.
    expect(nomeDeArquivoNoLibretro('Tom & Jerry: The Movie')).toBe('Tom _ Jerry_ The Movie');
    expect(nomeDeArquivoNoLibretro('R/C Pro-Am')).toBe('R_C Pro-Am');
  });

  it('deixa em paz o que não é reservado — inclusive parênteses e vírgula', () => {
    expect(nomeDeArquivoNoLibretro('Super Mario World (USA, Europe)')).toBe(
      'Super Mario World (USA, Europe)',
    );
  });
});

describe('urlsCandidatasDeCapa', () => {
  it('monta o caminho na estrutura real do servidor de thumbnails', () => {
    const urls = urlsCandidatasDeCapa(BASE, { systemId: 'snes', title: 'Chrono Trigger' });

    expect(urls[0]).toBe(
      'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger.png',
    );
    expect(urls[1]).toBe(
      'https://thumbnails.libretro.com/Nintendo%20-%20Super%20Nintendo%20Entertainment%20System/Named_Boxarts/Chrono%20Trigger%20(USA).png',
    );
  });

  it('usa a playlist do RetroArch de cada console, e não o nosso systemId', () => {
    const pastas = (['snes', 'nes', 'gb', 'gba', 'genesis'] as const).map((systemId) => {
      const [primeira] = urlsCandidatasDeCapa(BASE, { systemId, title: 'X' });
      return decodeURIComponent(primeira ?? '').split('/')[3];
    });

    expect(pastas).toEqual([
      'Nintendo - Super Nintendo Entertainment System',
      'Nintendo - Nintendo Entertainment System',
      'Nintendo - Game Boy',
      'Nintendo - Game Boy Advance',
      'Sega - Mega Drive - Genesis',
    ]);
  });

  it('tenta o título cru antes das regiões', () => {
    const urls = urlsCandidatasDeCapa(BASE, { systemId: 'gb', title: 'Tetris' });

    expect(urls.map((url) => decodeURIComponent(url.split('/Named_Boxarts/')[1] ?? ''))).toEqual([
      'Tetris.png',
      'Tetris (USA).png',
      'Tetris (World).png',
      'Tetris (USA, Europe).png',
      'Tetris (Europe).png',
      'Tetris (Japan, USA).png',
      'Tetris (Japan).png',
    ]);
  });

  it('não pergunta nada quando o título é vazio', () => {
    expect(urlsCandidatasDeCapa(BASE, { systemId: 'snes', title: '   ' })).toEqual([]);
  });

  it('não duplica a barra quando a base termina com uma', () => {
    const [url] = urlsCandidatasDeCapa(`${BASE}/`, { systemId: 'gb', title: 'Tetris' });
    expect(url).not.toContain('//Nintendo');
  });
});
