/**
 * O que o `pnpm emulator:setup` baixa, de onde, e com qual hash.
 *
 * Este arquivo é a fonte da verdade da versão do core. Trocar uma versão aqui
 * **invalida o save state de todo mundo** — o formato do save state do RetroArch
 * não é portável entre builds, e o `coreVersion` do adapter é derivado destes
 * mesmos campos (ver `packages/emulator-runtime/src/snes/core-assets.ts`).
 * Ver docs/adr/0011.
 */

/** Build do RetroArch em emscripten de onde saem os cores. Ver ADR 0011. */
export const VERSAO_RETROARCH = '1.22.2';

/**
 * Versão do Nostalgist.js. Precisa bater com a do `package.json` do
 * `@pixelvault/emulator-runtime` — o script confere e falha se divergir.
 */
export const VERSAO_NOSTALGIST = '0.22.0';

/**
 * Cores self-hostados.
 *
 * `sha256Zip` é do pacote como o CDN o entrega; `arquivos[].sha256` é de cada
 * arquivo já extraído. Os dois são conferidos: o primeiro pega adulteração no
 * transporte, o segundo pega arquivo corrompido em disco depois do setup.
 */
export const CORES = [
  {
    nome: 'snes9x2010',
    versao: VERSAO_RETROARCH,
    url: `https://cdn.jsdelivr.net/gh/arianrhodsandlot/retroarch-emscripten-build@v${VERSAO_RETROARCH}/retroarch/snes9x2010_libretro.zip`,
    sha256Zip: 'd3ba0ecca464329dd899a501f2368dbdf1a3b09036211830da1aa369217c9cfb',
    arquivos: [
      {
        nome: 'snes9x2010_libretro.js',
        sha256: 'c7bcc926b8799c4dd09d229cd7b01fac88c4e9ee3362b90cfa81bc9e61a58e60',
      },
      {
        nome: 'snes9x2010_libretro.wasm',
        sha256: '365f023f5fe038fd7c36b3e8957a4a78293770bd4810114268179177355043cc',
      },
    ],
  },
];

/**
 * Biblioteca do Nostalgist copiada do `node_modules`, e não baixada de CDN.
 *
 * O `apps/web` importa o Nostalgist pelo bundler; esta cópia existe para quem
 * carrega o runtime como script solto — hoje, o harness de verificação em
 * navegador do `emulator-runtime`. É cópia local justamente para não introduzir
 * uma segunda fonte de verdade da versão.
 */
export const NOSTALGIST = {
  versao: VERSAO_NOSTALGIST,
  origem: 'packages/emulator-runtime/node_modules/nostalgist/dist/nostalgist.js',
  destino: `nostalgist/${VERSAO_NOSTALGIST}/nostalgist.js`,
  sha256: 'a5087597c634032e1fe1f9a452bf6991f1919999fcffb8b477b3ff0992843b68',
};
