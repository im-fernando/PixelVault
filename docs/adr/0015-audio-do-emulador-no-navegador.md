# 0015. Manter a saída de áudio do RetroArch e pendurar um barramento de ganho nela

Data: 2026-09-07
Status: aceita

## Contexto

A [ADR 0011](0011-escolha-do-runtime-de-emulacao.md) escolheu Nostalgist.js e o
core `snes9x2010`, e registra que o spike da M1 rodou **em Chrome headless com
áudio mudo**. Áudio foi a única pergunta do spike que ficou sem resposta:
ninguém nunca tinha ouvido este emulador, e nenhuma medição tinha sido feita
com som ligado.

A issue #25 pedia saída de áudio por `AudioWorklet`, com a justificativa de que
`ScriptProcessorNode` é depreciado. A premissa precisava ser conferida antes de
qualquer código.

### O que o RetroArch já faz

Lido no `snes9x2010_libretro.js` que servimos (RetroArch 1.22.2, build
emscripten). O driver é o `RWebAudio`, e o arquivo tem **zero** ocorrências de
`ScriptProcessorNode`, `createScriptProcessor` **e** de `AudioWorklet`. O que
ele faz, por bloco de áudio:

```js
var buffer = RWA.context.createBuffer(2, num_frames, RWA.context.sampleRate);
// ... copia os dois canais do HEAPF32 ...
var bufferSource = RWA.context.createBufferSource();
bufferSource.buffer = buffer;
bufferSource.connect(RWA.context.destination);
var startTime = RWA.endTime > currentTime ? RWA.endTime : /* recomeça */;
RWA.endTime = startTime + buffer.duration;
bufferSource.start(startTime + RWA.extraLatencySec);
```

Ou seja: uma fila de `AudioBufferSourceNode` agendados encostados uns nos
outros. Não é a API depreciada, e não é `AudioWorklet` — é um terceiro caminho,
legítimo e não depreciado.

Dois pontos que decidem esta ADR:

- **A reamostragem já existe e é do RetroArch.** `_RWebAudioSampleRate()`
  devolve `context.sampleRate` ao RetroArch, que reamostra os 32.040 Hz do SNES
  para essa taxa com o reamostrador dele (`audio_resampler`).
- **O controle de taxa dinâmico também.** `_RWebAudioWriteAvailFrames()`
  informa quanto cabe na fila, e `audio_rate_control` ajusta a razão de
  reamostragem a partir disso. É esse laço fechado que mantém áudio e vídeo em
  sincronia sem acumular atraso. Quem escrever uma saída própria herda a
  obrigação de reimplementá-lo.

### O que foi medido

Chrome for Testing headless (Playwright 1.63), WebGL por SwiftShader,
**`--mute-audio` desligado**. ROM: `euc-thrills.sfc`, homebrew que toca música
desde o primeiro quadro — com jogo silencioso, "não há descontinuidade" é uma
afirmação vazia. A saída foi grampeada por um `AudioWorkletNode` do harness,
posto entre o emulador e o `destination`: ele mede exatamente as amostras que
chegariam ao alto-falante.

**O que já estava bom.** Em 60 s de regime: **0 lacunas e 0 sobreposições**
entre os buffers agendados; no nível da amostra, 960.512 quadros com maior
degrau entre amostras vizinhas de **0,018** e **nenhuma** corrida de zeros no
meio do som. A saída do RetroArch é contínua.

**O que estava ruim.**

| Defeito                                                  | Medida                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Buracos de silêncio com o `audio_latency` padrão (64 ms) | **30 buracos, 2,44 s de silêncio em 360 s** de jogo — um deles de 962 ms                                  |
| `pause()` não cala                                       | ~45 ms de áudio já agendado continuam tocando, e terminam em corte seco                                   |
| `resume()` estala                                        | lacuna de **528 amostras (11 ms)** de silêncio, e depois um degrau para o meio da onda                    |
| Aba invisível                                            | só depende do estrangulamento de `requestAnimationFrame` do navegador; o rabo agendado toca de todo jeito |
| Volume e mudo                                            | não existem: o `RWebAudio` liga cada fonte direto no `destination`, que não tem ganho                     |
| Política de autoplay                                     | o `RWebAudio` chama `context.resume()` a cada buffer (~100×/s) enquanto o contexto não toca               |

Sobre `audio_latency`, três corridas de 120 s para cada valor, com o mesmo
jogo, sem estrangular a CPU:

| `audio_latency` | buracos por corrida | silêncio total | margem mediana até tocar |
| --------------- | ------------------- | -------------- | ------------------------ |
| 64 (padrão)     | 21, 8, 1            | 2,44 s         | ~30 ms                   |
| **96**          | **0, 0, 0**         | **0**          | ~45 ms                   |

Numa matriz anterior, de 60 s por ponto, 32 ms piorou (15 buracos só sob CPU
estrangulada) e 128 e 160 ms também zeraram — sem nada a mais em troca, e com a
margem mediana subindo para ~62 e ~76 ms. Essa margem é o atraso entre o que se
vê e o que se ouve.

## Decisão

**Vamos manter a saída de áudio do RetroArch e pendurar um barramento de ganho
nela.** Não vamos escrever saída própria em `AudioWorklet`.

Em concreto:

1. **Um `GainNode` entre o `RWebAudio` e a saída.** A única alça é a leitura de
   `context.destination`, que o driver faz a cada buffer: sombrear essa
   propriedade na instância do contexto entrega o nosso nó no lugar do
   `destination` de verdade. É o `BarramentoDeAudio` de
   `packages/emulator-runtime/src/snes/audio-bus.ts`.
2. **Toda mudança de ganho é rampa, nunca degrau.** Degrau no ganho é
   descontinuidade, que é justamente o que se ouve como estalo. 20 ms para
   descer, 40 ms para subir.
3. **`audio_latency: 96`.** É o menor valor medido que zera os buracos, e cada
   passo além dele custa ~15 ms de atraso sem nada em troca.
4. **`audio_sync`, `audio_rate_control` e `audio_resampler` ficam fixados**, mesmo
   sendo o padrão do RetroArch. São eles que fazem o áudio funcionar; se um
   mudar de padrão numa atualização de core, a regressão é silenciosa e só
   aparece como estalo.
5. **Pausa e aba oculta calam pelo ganho, e não suspendendo o `AudioContext`.**
   O relógio do `RWebAudio` é `performance.now()`, e não `context.currentTime`:
   suspender congela um e não o outro, e ao voltar o driver agenda no passado
   tudo o que deveria ter tocado. Isso é exatamente o "áudio adiantado ao
   voltar da aba" que a issue proíbe.
6. **`resume()` sem gesto do usuário não chega ao navegador.** A subclasse de
   `AudioContext` que já existia para não vazar contexto (ADR 0011) passa a
   filtrar `resume()` enquanto `navigator.userActivation.hasBeenActive` for
   falso. Insistir ~100×/s no que a política de autoplay já recusou é o que
   enche o console de _"The AudioContext was not allowed to start"_.
7. **Volume, mudo e "o navegador ainda não deixou tocar" entram no contrato**,
   em `EmulatorAudioControl` e no evento `audioChange`, e não no adapter de
   SNES. Nenhum deles é assunto de core, e a UI do player não pode precisar
   saber qual core está por baixo. A preferência é persistida em
   `localStorage`, atrás de um `AudioSettingsStore` injetável.

O `AudioWorklet` que a issue pedia existe — no **harness de verificação**
(`verificacao/verificar-audio.mjs`), grampeando a saída para provar que ela é
contínua. É o uso em que ele acrescenta alguma coisa.

## Consequências

**Fica mais fácil**

- Não herdamos a obrigação de reimplementar o controle de taxa dinâmico do
  RetroArch. Uma saída própria que ignorasse a realimentação de ocupação da
  fila trocaria estalo por dessincronia progressiva entre áudio e vídeo — um
  defeito pior, porque demora minutos para aparecer.
- O barramento é um nó. Cabe em uma tela de código, é testável com um
  `AudioContext` falso, e não tem thread de áudio própria para depurar.
- Volume e mudo são instantâneos. Pela via do RetroArch (`audio_volume`,
  comando `MUTE`) passariam pelo canal de um comando por quadro, que já é
  disputado por save state, screenshot e leitura de memória (ADR 0008).

**Fica mais difícil**

- **Dependemos de um detalhe de implementação do `RWebAudio`:** que ele leia
  `context.destination` a cada buffer, em vez de guardar a referência. Se uma
  atualização de RetroArch trocar isso, o volume para de funcionar em silêncio.
  A verificação em navegador é o que acusa — ela mede o ganho chegando na
  saída, e não a existência do nó.
- **Sombrear uma propriedade do `AudioContext` é invasivo.** Qualquer código
  que espere um `AudioDestinationNode` de verdade em `context.destination`
  (`maxChannelCount`, por exemplo) recebe um `GainNode`. Hoje só o `RWebAudio`
  lê essa propriedade, e ele só a usa para `connect`.
- **A latência subiu de propósito.** ~15 ms a mais entre o quadro e o som dele.
  É meio quadro a 60 Hz, e foi o preço de não ter buraco.
- **A política de autoplay não é verificável em headless.** Chrome headless
  concede ativação de usuário sozinho e nunca recusa o autoplay: o freio do
  `resume()` é coberto por teste de unidade, e o console limpo, por contagem no
  harness — mas a recusa em si só se observa num Chrome de tela.
- **Ninguém ouviu.** Tudo acima é medição de amostras, não escuta. Continuidade
  medida não é o mesmo que "soa bem": timbre, equilíbrio entre os canais e
  velocidade percebida continuam dependendo de um par de ouvidos.

## Alternativas descartadas

### Escrever a saída em `AudioWorklet`, com buffer circular

É o que a issue #25 pedia. Seria: `retro_audio_sample_batch` → buffer circular
em `SharedArrayBuffer` (ou `postMessage`) → `AudioWorkletProcessor` que
consome 128 quadros por bloco de renderização.

Descartada porque o problema que ela resolve **não foi medido**. A justificativa
da issue era `ScriptProcessorNode` depreciado, e o RetroArch não usa
`ScriptProcessorNode`. A saída atual entregou 60 s contínuos, sem lacuna entre
buffers e sem degrau entre amostras. Trocá-la significaria refazer, do lado de
fora, o controle de taxa que hoje é do RetroArch — e o modo de falhar disso não
é estalo, é o áudio e o vídeo se afastarem devagar.

Fica registrada como saída para dois cenários: se o `RWebAudio` mudar de forma
que quebre o barramento, ou se a medição em máquina de gente encontrar buracos
que o `audio_latency` não resolva.

### Usar `audio_volume` e o comando `MUTE` do RetroArch

O core sabe fazer os dois. Descartada por duas razões: o canal de comando
processa **um comando por quadro** e já é disputado por save state, screenshot
e leitura de memória (ADR 0008), e `audio_volume` aplica um degrau no ganho —
que é a descontinuidade que estamos tentando eliminar.

### Suspender o `AudioContext` ao pausar ou ao esconder a aba

Seria a forma mais completa de calar: o navegador solta o dispositivo de áudio.
Descartada pelo relógio do `RWebAudio`, que é `performance.now()`. Com o
contexto suspenso, `context.currentTime` congela e `performance.now()` não —
o driver passa a agendar no passado, e ao voltar toca de uma vez tudo o que
deveria ter tocado. É literalmente o defeito que o critério de aceite da issue
proíbe ("alternar de aba e voltar não deixa o áudio adiantado").

### Pausar a emulação quando a aba fica invisível

Resolveria o áudio de aba invisível de forma trivial. Descartada porque é
política do player, e não do runtime: quem decide se o jogo continua rodando
em segundo plano é a tela que sabe se há sessão aberta, save pendente e o que
mais. O adapter cala o som e devolve a decisão.

### `audio_latency` maior que 96 ms

128 e 160 também zeraram os buracos na medição. Descartados porque não zeraram
_mais_ nada — e cada passo custa ~15 ms de distância entre o que se vê e o que
se ouve, que é o defeito de emulação logo depois do estalo na lista de coisas
que se percebe.
