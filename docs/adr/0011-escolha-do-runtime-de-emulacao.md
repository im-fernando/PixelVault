# 0011. Adotar Nostalgist.js como runtime de emulação

Data: 2026-09-07
Status: aceita

## Contexto

A emulação roda no cliente ([arquitetura](../arquitetura.md)) e o usuário traz as
próprias ROMs ([ADR 0006](0006-byor-mais-catalogo-de-metadados.md)). Isso impõe
requisitos que não são negociáveis: a ROM precisa entrar como bytes (nunca como
URL pública), a SRAM e o save state precisam sair e entrar como bytes para
sincronizar com o servidor, e a interface precisa ser nossa.

O spike da M1 (issues #13 e #14) prototipou os três candidatos rodando o mesmo
homebrew. Os números abaixo foram medidos, não estimados — o método e as
limitações estão em [docs/spikes](../spikes/README.md).

### Ambiente da medição

- Chrome for Testing 153.0.8010.12 (Playwright 1.63, headless), WebGL por SwiftShader (software), áudio mudo.
- ROM: `horizontal-shooter.sfc`, de [undisbeliever](https://github.com/undisbeliever/horizontal-shooter),
  licença MIT, `sha256:3f6f83b5cb0be44dcd1a905cd57a2a8a1a77d320585d1894d0a02c84b33d6067`.
- Nostalgist.js 0.22.0 + cores `retroarch-emscripten-build` v1.22.2 (RetroArch 1.22.2).
- EmulatorJS 4.2.4 servido pelo CDN oficial (RetroArch 1.21.0).

### Tabela comparativa

| Critério                              | Nostalgist.js                                                                                                    | EmulatorJS                                                                              | Core libretro em WASM direto           |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- |
| ROM como bytes, sem URL pública       | **sim** — `rom: { fileContent: Uint8Array }`, verificado                                                         | **sim** — `EJS_gameUrl` aceita `blob:` e `File`, verificado                             | sim, por definição                     |
| Save state como bytes                 | **sim** — `saveState()` devolve `Blob` de **8.483 B** (comprimido)                                               | sim — `gameManager.getState()` devolve **823.432 B**, sem compressão                    | sim, `retro_serialize`                 |
| Import de save state                  | **sim** — `loadState(bytes)`, verificado                                                                         | sim — `gameManager.loadState(bytes)`                                                    | sim, `retro_unserialize`               |
| SRAM export / import                  | `saveSRAM(): Blob` e opção `sram` na launch; FS acessível (ida e volta ok)                                       | `getSaveFile()` / `writeFile()`                                                         | sim, `retro_get_memory_data(SAVE_RAM)` |
| UI própria imposta                    | **1 elemento no DOM** — só o `<canvas>`                                                                          | **2.485 elementos** no container, com CSS, menu e overlays próprios                     | nenhuma                                |
| Leitura de memória a partir do JS     | **sim**, com core que declara memory maps (ver [ADR 0008](0008-viabilidade-de-conquistas-por-evento-de-jogo.md)) | **não** na prática — só publica `snes9x` para SNES, que não declara memory maps         | sim, direta                            |
| Exige `SharedArrayBuffer` (COOP/COEP) | **não** — nenhuma ocorrência no glue, `crossOriginIsolated === false`                                            | **não** para SNES (só `ppsspp`, `dosbox_pure` e `azahar` pedem threads)                 | depende de como for compilado          |
| Licença da biblioteca                 | **MIT**                                                                                                          | **GPL-3.0**                                                                             | n/a (código nosso)                     |
| Tamanho da biblioteca                 | 96 KB cru / **23 KB gzip**, um arquivo                                                                           | `emulator.min.js` 426 KB + CSS 26 KB + `loader.js` 8 KB + JSONs; 15 requisições no boot | o que escrevermos                      |
| Tamanho do core (SNES)                | `snes9x2010`: zip **1,15 MB** (wasm 3,95 MB)                                                                     | `snes9x`: 7z **1,09 MB** (wasm 6,32 MB)                                                 | só o core, sem RetroArch em volta      |
| Self-host dos assets                  | **sim, verificado** — servimos o `.js` e o `.wasm` do nosso domínio                                              | sim, mas é a pasta `data/` inteira do projeto                                           | sim                                    |
| Escolha de core                       | qualquer um dos 90 do build emscripten                                                                           | lista fixa no código; para SNES, `snes9x` e `bsnes` — e `bsnes` **retorna 404 no CDN**  | qualquer um, se compilarmos            |
| Custo para a M1                       | dias                                                                                                             | dias                                                                                    | semanas                                |

## Decisão

Vamos usar **Nostalgist.js** como runtime de emulação, servindo os assets do
nosso domínio, atrás do contrato `EmulatorAdapter` de `packages/emulator-runtime`.

O core padrão de SNES é **`snes9x2010`**, e não `snes9x`. O motivo é o [ADR
0008](0008-viabilidade-de-conquistas-por-evento-de-jogo.md): só `snes9x2010`
declara memory maps, e save state não é portável entre cores. Escolher `snes9x`
agora e migrar depois significaria invalidar o save state de todo mundo.

Nada no `apps/web` fala com o Nostalgist direto: o adapter é a única superfície,
exatamente para que esta ADR possa ser substituída sem reescrever o player.

## Consequências

**Fica mais fácil**

- O HUD é nosso do primeiro dia. Um `<canvas>` no DOM, sem CSS de terceiro para
  brigar e sem menu que aparece por cima do nosso.
- Save state de 8,5 KB em vez de 823 KB. São ~100× menos bytes por revisão
  trafegando e ocupando o storage. Para um recurso que sincroniza a cada
  sessão, isso muda o custo do produto, não só o número.
- O projeto continua MIT. A biblioteca que importamos é MIT, e o RetroArch em
  WASM é um binário que servimos ao lado, não código que entra no nosso bundle.
- 23 KB gzip no bundle. O peso real é o core, que é lazy e cacheável.

**Fica mais difícil**

- **Escrevemos tudo que o EmulatorJS dava de graça**: HUD, atalhos, controle
  virtual para toque, remapeamento de teclas, seleção de core, tela de
  carregamento. Isso é trabalho de M1 que o outro candidato pouparia.
- **Nostalgist é 0.x, de um mantenedor só.** A API pode quebrar entre versões
  menores. É por isso que o `EmulatorAdapter` existe e é por isso que a versão
  fica travada no `package.json`, não em faixa.
- **Somos donos da atualização dos cores.** Por padrão o Nostalgist baixa de um
  repositório de terceiro pelo jsDelivr; nós self-hostamos, então subir de
  RetroArch 1.22.2 para a próxima é tarefa nossa, com o risco de save state
  quebrar junto.
- **O `snes9x2010` é menos preciso que o `snes9x`.** Trocamos exatidão de
  emulação por leitura de memória. Se algum jogo relevante quebrar, a saída é
  rodar `snes9x` naquela sessão e aceitar que ela não gera conquista de evento —
  com o efeito colateral de que o save state daquela sessão não abre no outro
  core.
- **O core de SNES é _non-commercial_.** A licença do Snes9x — herdada pelo
  `snes9x2010` — permite uso e distribuição apenas para fins não comerciais.
  Toda a família disponível no build emscripten (`snes9x`, `snes9x2002`,
  `snes9x2005`, `snes9x2010`) descende dele. Se o PixelVault um dia cobrar,
  precisamos de um core com licença livre (bsnes ou Mesen-S, ambos GPL)
  compilado por nós. Isso é uma dívida conhecida, não uma surpresa futura.
- **O RetroArch em WASM é GPLv3.** Servimos o binário, então servimos também a
  licença e a oferta do código correspondente do build que publicamos.

## Alternativas descartadas

### EmulatorJS

Descartado por três motivos independentes, qualquer um deles suficiente:

1. **GPL-3.0.** O `apps/web` importaria o EmulatorJS como módulo, no mesmo
   bundle. O PixelVault é MIT. Não é um detalhe que se resolve com um arquivo de
   licença; é o tipo de decisão que se toma uma vez e se carrega para sempre.
2. **Save state de 823.432 B contra 8.483 B do Nostalgist**, medido no mesmo
   jogo, no mesmo instante. O `getState()` do EmulatorJS devolve o estado cru; o
   Nostalgist lê o `.state` já comprimido pelo RetroArch. Para um produto que
   sincroniza save state, essa diferença é o custo de storage e de banda.
3. **Não dá acesso à memória para SNES.** O canal existe no core (é o mesmo
   RetroArch), mas o único core de SNES publicado no CDN é o `snes9x`, que não
   declara memory maps — `READ_CORE_MEMORY` responde `no memory map defined`. O
   `bsnes` está listado no código do projeto, mas o arquivo do core retorna 404.
   Isso sozinho reprovaria o EmulatorJS na issue #14.

Some-se a isso 2.485 elementos de UI própria no DOM contra 1, e 426 KB de
JavaScript contra 96 KB. O que o EmulatorJS ganha — funcionar em minutos, muitos
sistemas, controle por toque pronto — é real, e é exatamente o que vamos ter que
escrever. Foi um custo aceito conscientemente.

### Core libretro em WASM direto

É a opção tecnicamente superior e a única que dá leitura de memória sem
intermediário: `retro_get_memory_data` devolveria um ponteiro direto para a WRAM
dentro do `HEAPU8`, com custo de acesso de array.

Descartada pelo prazo. O caminho oficial de build emscripten do libretro compila
o core **estaticamente dentro do RetroArch** — foi isso que verificamos nos dois
candidatos: o `.wasm` do `snes9x` exporta 49 símbolos, todos minificados, e
nenhum `retro_*`. Para ter o core sozinho seria preciso compilá-lo com
`EXPORTED_FUNCTIONS` próprio e depois escrever o frontend inteiro: vídeo em GL,
áudio em WebAudio com ring buffer, input, timing, serialização de estado. São
semanas, contra os 3 dias de timebox da M1.

Fica registrada como saída de emergência para dois cenários previstos: se a
cláusula não comercial do Snes9x virar problema, ou se a precisão do
`snes9x2010` se mostrar insuficiente.

### Escrever nosso próprio wrapper sobre o `retroarch.js`

Ou seja: fazer na mão o que o Nostalgist faz. Descartada porque o custo de
escrever é maior que o custo de trocar depois — e o `EmulatorAdapter` já garante
que trocar depois é barato. Reconsiderar isso é reconsiderar o adapter.

### Varrer o `HEAPU8` procurando a WRAM

Alternativa para ler memória sem depender de o core declarar memory maps:
localizar o buffer da WRAM dentro do heap do Emscripten por assinatura e ler
direto. Funcionaria com o `snes9x`, que é mais preciso.

Descartada por fragilidade: o endereço depende do layout do heap daquele build
específico, e qualquer atualização de core ou de emsdk pode movê-lo em silêncio.
Um bug assim não falha, ele lê lixo — e conquista concedida por lixo é pior que
conquista que não existe.
