/**
 * Onde moram os assets do core e como a versão deles vira identidade.
 *
 * Os arquivos são self-hostados por `pnpm emulator:setup`, num caminho
 * versionado (`/emulator/<core>/<versão>/`). Versionar o caminho não é
 * capricho de cache: **save state não é portável entre builds de core**, então
 * a versão precisa ser um fato observável do lado do cliente, e não uma
 * suposição. Ver docs/adr/0011 e a issue #17.
 */

/**
 * Core de SNES. É `snes9x2010`, e **não** `snes9x`.
 *
 * O motivo está na ADR 0008: só o `snes9x2010` declara
 * `RETRO_ENVIRONMENT_SET_MEMORY_MAPS`, e sem memory maps o `READ_CORE_MEMORY`
 * responde `-1 no memory map defined` — o que mataria conquista por evento de
 * jogo na M6. Trocar de core depois invalidaria o save state de todo mundo, o
 * que faz desta uma escolha de mão única.
 */
export const CORE_DE_SNES = 'snes9x2010';

/** Build do RetroArch em emscripten. Precisa bater com `scripts/emulador/manifesto.mjs`. */
export const VERSAO_DO_CORE_DE_SNES = '1.22.2';

/** Base padrão dos assets servidos pelo próprio `apps/web`. */
export const BASE_PADRAO_DOS_ASSETS = '/emulator';

/**
 * Identidade do core que entra no save state.
 *
 * Carrega core **e** versão porque é isso que detecta incompatibilidade: um
 * save gravado com `snes9x2010@1.22.2` não abre num build diferente, e quem
 * atualizou o navegador precisa ver um erro claro em vez de a tela travar.
 */
export const VERSAO_DO_CORE = `${CORE_DE_SNES}@${VERSAO_DO_CORE_DE_SNES}`;

export interface SnesCoreAssets {
  /** Nome do core como o RetroArch o conhece. Entra no nome dos arquivos. */
  readonly nome: string;
  readonly versao: string;
  readonly urlDoJs: string;
  readonly urlDoWasm: string;
}

/** Monta os caminhos self-hostados a partir da base. */
export function assetsDoCoreDeSnes(base: string = BASE_PADRAO_DOS_ASSETS): SnesCoreAssets {
  const raiz = `${base.replace(/\/+$/, '')}/${CORE_DE_SNES}/${VERSAO_DO_CORE_DE_SNES}`;
  return {
    nome: CORE_DE_SNES,
    versao: VERSAO_DO_CORE_DE_SNES,
    urlDoJs: `${raiz}/${CORE_DE_SNES}_libretro.js`,
    urlDoWasm: `${raiz}/${CORE_DE_SNES}_libretro.wasm`,
  };
}
