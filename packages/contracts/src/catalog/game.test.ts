import { describe, expect, it } from 'vitest';
import { coverRefSchema, gameSchema } from './game.js';

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
