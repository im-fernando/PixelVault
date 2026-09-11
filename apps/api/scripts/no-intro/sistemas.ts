import type { SystemId } from '@pixelvault/contracts';

/**
 * O nome do sistema no banco No-Intro/libretro-database, por `SystemId`.
 *
 * É a mesma string que `PLAYLIST_POR_SISTEMA`, em
 * `apps/api/src/modules/catalog/infrastructure/nomes-no-libretro.ts`, usa
 * para montar a pasta de thumbnail — os dois bancos (No-Intro e
 * libretro-thumbnails) seguem a mesma convenção de nome de sistema, e é por
 * isso que a issue #134 pôde reaproveitar a lista sem descobrir nada novo.
 * Duplicada aqui de propósito: este arquivo não é módulo, é script
 * administrativo fora de `src/`, e não deveria importar `catalog/infrastructure`
 * — a única coisa que este script pode enxergar do módulo é o que
 * `catalog/index.ts` exporta, e o nome de pasta de thumbnail não é assunto
 * dele.
 */
export const SISTEMA_NO_INTRO: Record<SystemId, string> = {
  snes: 'Nintendo - Super Nintendo Entertainment System',
  nes: 'Nintendo - Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gba: 'Nintendo - Game Boy Advance',
  genesis: 'Sega - Mega Drive - Genesis',
};

/** Os cinco sistemas suportados, na ordem em que os scripts processam. */
export const SISTEMAS_SUPORTADOS = Object.keys(SISTEMA_NO_INTRO) as SystemId[];
