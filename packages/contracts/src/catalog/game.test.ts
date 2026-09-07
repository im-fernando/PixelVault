import { describe, expect, it } from 'vitest';
import { coverRefSchema, gameDetailSchema, gameSchema } from './game.js';

describe('coverRefSchema', () => {
  it('aceita caminho a partir da raiz — é o que evita gravar a origem no banco', () => {
    expect(coverRefSchema.safeParse('/roms/sure-instinct/capa.png').success).toBe(true);
  });

  it('aceita URL absoluta, para capa vinda de CDN externo', () => {
    expect(coverRefSchema.safeParse('https://cdn.exemplo.com/capa.png').success).toBe(true);
  });

  it.each(['roms/capa.png', '//exemplo.com/capa.png', '/com espaco.png', ''])(
    'recusa %o',
    (valor) => {
      expect(coverRefSchema.safeParse(valor).success).toBe(false);
    },
  );
});

describe('gameSchema', () => {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    systemId: 'snes' as const,
    title: 'Sure Instinct',
    slug: 'sure-instinct',
    releaseYear: 2021,
    publisher: 'Benjamin Schulte',
    isHomebrew: true,
  };

  it('aceita capa relativa', () => {
    expect(
      gameSchema.safeParse({ ...base, coverUrl: '/roms/sure-instinct/capa.png' }).success,
    ).toBe(true);
  });

  it('aceita ausência de capa', () => {
    expect(gameSchema.safeParse({ ...base, coverUrl: null }).success).toBe(true);
  });
});

describe('gameDetailSchema', () => {
  const base = {
    id: '00000000-0000-4000-8000-000000000001',
    systemId: 'snes' as const,
    title: 'Sure Instinct',
    slug: 'sure-instinct',
    releaseYear: 2021,
    publisher: 'Benjamin Schulte',
    coverUrl: null,
    isHomebrew: true,
  };

  const rom = {
    url: '/roms/sure-instinct/sure-instinct.sfc',
    fileName: 'sure-instinct.sfc',
    sha256: '73390b30a441ecc8042038f959b34e981ed8b5a0d9053b4d94d1dcd968a0f0ef',
    sizeBytes: 524288,
  };

  it('aceita homebrew com a ROM que nós servimos', () => {
    expect(gameDetailSchema.safeParse({ ...base, homebrewRom: rom }).success).toBe(true);
  });

  it('aceita jogo sem ROM nossa — é o caso de todo título comercial', () => {
    expect(
      gameDetailSchema.safeParse({ ...base, isHomebrew: false, homebrewRom: null }).success,
    ).toBe(true);
  });

  it('recusa sha256 que não seja hexadecimal minúsculo de 64 caracteres', () => {
    expect(
      gameDetailSchema.safeParse({ ...base, homebrewRom: { ...rom, sha256: 'abc' } }).success,
    ).toBe(false);
  });

  it('recusa caminho de ROM sem barra inicial, que dependeria da rota atual', () => {
    expect(
      gameDetailSchema.safeParse({
        ...base,
        homebrewRom: { ...rom, url: 'roms/sure-instinct/sure-instinct.sfc' },
      }).success,
    ).toBe(false);
  });
});
