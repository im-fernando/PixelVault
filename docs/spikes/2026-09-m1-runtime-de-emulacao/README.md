# Spike M1 — runtime de emulação e leitura de memória

Setembro de 2026. Sustenta a
[ADR 0011](../../adr/0011-escolha-do-runtime-de-emulacao.md) e a
[ADR 0008](../../adr/0008-viabilidade-de-conquistas-por-evento-de-jogo.md).
Issues #13 e #14.

**Descartável.** Está aqui para que os números das ADRs possam ser refeitos por
outra pessoa, não para ser mantido.

## Como rodar

Fora do monorepo, numa pasta temporária qualquer:

```bash
mkdir -p /tmp/spike && cd /tmp/spike
npm init -y && npm install playwright-core nostalgist
npx playwright install chromium   # ou aponte CHROME= para um Chrome existente

mkdir -p www/cores
cp node_modules/nostalgist/dist/nostalgist.js www/

# core: o mesmo que o Nostalgist baixaria, self-hostado
curl -L -o core.zip \
  'https://cdn.jsdelivr.net/gh/arianrhodsandlot/retroarch-emscripten-build@v1.22.2/retroarch/snes9x2010_libretro.zip'
unzip core.zip -d www/cores

# ROM de teste (procedência abaixo)
curl -L -o www/horizontal-shooter.sfc \
  'https://raw.githubusercontent.com/retrobrews/snes-games/master/horizontal-shooter.sfc'

# copie index.html e medir.mjs deste diretório para /tmp/spike
node medir.mjs
```

Trocar `snes9x2010` por `snes9x` na URL do core e no `?core=` reproduz o
` -1 no memory map defined` que reprovou aquele core.

## Procedência da ROM

`horizontal-shooter.sfc` — demo de shooter horizontal feita com a
[UnTech Game Engine](https://github.com/undisbeliever/untech-engine), por
undisbeliever. Código sob **licença MIT**, imagens sob **CC-0**; fonte em
<https://github.com/undisbeliever/horizontal-shooter>. O binário foi baixado da
coleção [retrobrews/snes-games](https://github.com/retrobrews/snes-games).

`sha256:3f6f83b5cb0be44dcd1a905cd57a2a8a1a77d320585d1894d0a02c84b33d6067`
(109.824 bytes)

A ROM **não** está versionada neste repositório. O comando acima a baixa.

## Ambiente onde os números das ADRs foram medidos

- Chrome for Testing 153.0.8010.12, headless, via Playwright 1.63
- WebGL por SwiftShader (renderização por software), áudio mudo
- Nostalgist.js 0.22.0
- Cores de `arianrhodsandlot/retroarch-emscripten-build` v1.22.2 (RetroArch 1.22.2)
- EmulatorJS 4.2.4, pelo CDN oficial (RetroArch 1.21.0)

O que este ambiente **não** mede: áudio, frame pacing em GPU real, aparelho
fraco, mobile, Safari. Está registrado nas duas ADRs.

## Arquivos

- `index.html` — página mínima que sobe o Nostalgist com a ROM injetada como
  `Uint8Array` e um core self-hostado, sem UI nenhuma além do `<canvas>`.
- `medir.mjs` — sobe um servidor estático, abre o Chrome headless, prova o canal
  `READ_CORE_MEMORY` / `WRITE_CORE_MEMORY` e mede o FPS em várias frequências de
  amostragem.

O protótipo equivalente do EmulatorJS não foi guardado: ele é literalmente
declarar as globais `EJS_*` e carregar o `loader.js` do CDN, e o que ele
respondeu (`-1 no memory map defined`, save state de 823.432 B, 2.485 elementos
de DOM) está na tabela da ADR 0011.
