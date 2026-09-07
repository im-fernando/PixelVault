# Licenças dos assets de emulação

> Este arquivo é copiado para `apps/web/public/emulator/LICENCAS.md` pelo
> `pnpm emulator:setup`, e fica servido em `/emulator/LICENCAS.md`. O original
> versionado é `scripts/emulador/LICENCAS.md`.

Os binários desta pasta **não** são nossos e **não** são MIT. O PixelVault é
MIT; o que roda dentro do WebAssembly não é. Os dois avisos abaixo são
obrigações reais, não formalidade.

## RetroArch (build emscripten) — GPLv3

`*_libretro.js` e `*_libretro.wasm` são o RetroArch {{VERSAO_RETROARCH}}
compilado para WebAssembly, com o core libretro ligado estaticamente dentro
dele. O RetroArch é distribuído sob a **GNU General Public License v3**.

- Fonte do RetroArch: <https://github.com/libretro/RetroArch>
- Build usado: <https://github.com/arianrhodsandlot/retroarch-emscripten-build>,
  tag `v{{VERSAO_RETROARCH}}`
- Texto da licença: <https://github.com/libretro/RetroArch/blob/master/COPYING>

**Obrigação que assumimos:** ao distribuir este binário, distribuímos junto a
oferta do código-fonte correspondente. As duas URLs acima são essa oferta: o
binário é reproduzível a partir daquele repositório de build, na tag indicada, e
o manifesto em `scripts/emulador/manifesto.mjs` registra o SHA-256 exato do
pacote de onde ele saiu.

O RetroArch **não** entra no bundle do `apps/web` — ele é um arquivo servido ao
lado, carregado em tempo de execução. É por isso que o PixelVault continua MIT.
Ver [ADR 0011](../../docs/adr/0011-escolha-do-runtime-de-emulacao.md).

## Snes9x / `snes9x2010` — **uso não comercial**

O core `snes9x2010` descende do **Snes9x**, cuja licença permite uso,
distribuição e modificação **apenas para fins não comerciais**:

> Snes9x is freeware for personal use. (...) Distributing Snes9x in a
> commercial package, or selling it in any form, is expressly forbidden without
> the written permission of the copyright holders.

- Fonte: <https://github.com/libretro/snes9x2010>
- Licença: <https://github.com/libretro/snes9x2010/blob/master/docs/snes9x-license.txt>

**Dívida conhecida, registrada na [ADR 0011](../../docs/adr/0011-escolha-do-runtime-de-emulacao.md):**
toda a família disponível no build emscripten (`snes9x`, `snes9x2002`,
`snes9x2005`, `snes9x2010`) herda essa cláusula. **Se o PixelVault um dia
cobrar por qualquer coisa, este core precisa sair.** A substituição prevista é
um core de licença livre — bsnes ou Mesen-S, ambos GPL — compilado por nós.

Trocar de core **invalida o save state de todo mundo**: o formato não é portável
entre cores nem entre builds. Não é uma troca de arquivo, é uma migração.

## Nostalgist.js — MIT

`nostalgist/<versão>/nostalgist.js` é a biblioteca que orquestra o RetroArch em
WASM, sob licença **MIT**.

- Fonte: <https://github.com/arianrhodsandlot/nostalgist>

Esta cópia existe para quem carrega o runtime como script solto; o `apps/web`
importa o Nostalgist pelo bundler, do `node_modules`.

## Como reproduzir e conferir

```bash
pnpm emulator:setup             # baixa e confere
pnpm emulator:setup --verificar # só confere o que já está em disco
```

Os SHA-256 esperados estão em `scripts/emulador/manifesto.mjs`. Hash divergente
é tratado como adulteração: o script falha e não instala nada.
