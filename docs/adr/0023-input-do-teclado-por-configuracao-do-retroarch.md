# 0023. Configurar o teclado do RetroArch no boot, em vez de simular estado por quadro

Data: 2026-09-10
Status: aceita

## Contexto

O `EmulatorAdapter` (ADR 0004) não tem nenhum método de entrada — nem
`setButtonState`, nem equivalente. Ainda assim o jogo responde ao teclado: sem
apertar nada, o Super Mario World fica na tela-título; com três Enter, passa
pelo file select. O input chega ao core. Só não passa por nós.

Isso acontece porque o RetroArch, dentro do build emscripten, registra seu
próprio ouvinte de `keydown`/`keyup` no elemento do canvas — é o driver de
teclado do SDL, lido em `updateKeyboardEventHandlers` do Nostalgist. Com
`respondToGlobalEvents: false` (nosso padrão), o Nostalgist ainda dá foco ao
canvas assim que o core sobe (`element.focus()`), e o RetroArch interpreta a
tecla física comparando o `code` do evento com o que está em
`input_player1_*` no `retroarch.cfg` carregado — hoje, o padrão de fábrica do
RetroArch, porque o `SnesEmulatorAdapter` nunca escreveu nada ali.

A camada de input do `apps/web` (`snes-keymap.ts`, `keyboard-input.ts`,
`gamepad-*`) faz outra coisa completamente: traduz tecla em
`EstadoDoGamepad` para desenhar a legenda na tela e o indicador de controle.
Ela nunca chega ao core. `MAPA_PADRAO_DE_TECLADO` (ArrowUp→up, KeyZ→b, KeyX→a,
...) só "funciona" porque coincide, tecla por tecla, com o padrão de fábrica
do RetroArch. Ninguém garantiu essa coincidência — editar uma linha do nosso
mapa muda a legenda e não muda o jogo, e a tela passa a mentir para quem está
jogando. O mesmo vale para `comandos.definirGamepad`, que sempre foi um
no-op: nenhum adapter jamais implementou `setButtonState` (ver #21 / PR #35).

### O que o Nostalgist realmente expõe

A classe `Nostalgist` tem `press`, `pressDown` e `pressUp` — API pública,
documentada, que simula botão programaticamente. Por baixo, os três chamam
`Emulator#getKeyboardCode(button, player)`, que lê o `retroarch.cfg` **que
está rodando** (`input_player1_<button>`), traduz o valor para um
`KeyboardEvent.code` e injeta o evento direto nos `JSEvents.eventHandlers` do
Emscripten — sem passar pelo DOM.

Isso mostra duas coisas:

1. **`input_player1_*` é sintaxe documentada do RetroArch**, não detalhe
   interno do Nostalgist. O tipo `RetroArchConfig` do pacote documenta os
   valores aceitos (letras `a`-`z`, e nomes como `up`, `enter`, `rshift`) —
   é contrato público de configuração, estável entre versões de core.
2. **O RetroArch já lê o teclado a partir de uma configuração**, não de um
   mapa embutido imutável. O "padrão de fábrica" que hoje coincide com o
   nosso mapa é, ele mesmo, uma configuração — só que uma que nunca
   escrevemos.

## Decisão

**Vamos gerar o `input_player1_*` do `retroarchConfig`, no boot, a partir do
mesmo mapa que a legenda da UI desenha — e não vamos simular estado de botão
por quadro.**

Em concreto:

1. `BOTOES_DO_SNES`, `BotaoDoSnes` e `MAPA_PADRAO_DE_TECLADO` saem de
   `apps/web` e passam a viver em
   `packages/emulator-runtime/src/snes/keyboard-bindings.ts`, ao lado do
   adapter que precisa deles para montar o boot. `apps/web` reexporta os
   mesmos objetos para a legenda — não uma cópia.
2. `configDeTecladoDoRetroArch(mapa)`, no mesmo arquivo, traduz
   `KeyboardEvent.code` → nome de tecla do RetroArch (`ArrowUp` → `up`,
   `KeyZ` → `z`, ...) e devolve `{ input_player1_up: 'up', input_player1_b:
   'z', ... }`.
3. `SnesEmulatorAdapter#prepararMaquina` manda
   `...configDeTecladoDoRetroArch()` no `retroarchConfig` de todo boot, antes
   de `...this.#retroarchConfig` — quem passar `retroarchConfig` nas opções
   do adapter continua podendo sobrescrever.
4. `EmulatorAdapter` **não ganha** `setButtonState` nem qualquer método de
   entrada. O contrato continua sem input porque o teclado nunca precisou
   passar por ele: o core lê o DOM, e agora lê configurado por nós.
5. `comandos.definirGamepad`, `AdapterComEntrada` e `suportaEntrada` saem do
   `apps/web` — eram scaffolding para um método que nunca existiu e nunca
   vai existir sob esta decisão. `useEntradaDoJogador` continua computando
   `EstadoDoGamepad` para a legenda e o indicador de controle; só o callback
   `aoMudar` (que alimentava o no-op) virou opcional.

Isto é a alternativa (b) da issue #36: assumir que o core lê o DOM, e fazer a
nossa camada configurar o RetroArch em vez de simular. O mapa vira
configuração enviada no boot, não estado enviado por quadro.

### A garantia de "input desligado com a aba oculta" continua valendo

A issue perguntava se essa garantia sobrevive a quem escuta ser o core, e
não nós. Sobrevive, e por um motivo que não depende desta ADR: aba oculta não
para de escutar tecla, **para o laço principal do RetroArch**
(`useEmulator`'s efeito de `visibilitychange` chama `adapter.pause()`, que é
`nostalgist.pause()` — pausa o `mainLoop` do Emscripten, não um listener).
Sem o laço rodando, o core não faz `input_poll` nenhuma vez, então uma tecla
física apertada com a aba escondida fica só como evento JS não lido — não
avança frame, não move personagem. Isso já era verdade antes da ADR 0011 com
qualquer runtime de emulação síncrono e continua sendo verdade agora: quem
desliga o jogo é o `pause()`, não a ausência de um ouvinte de teclado.

### Por que não (a) — `setButtonState` por quadro, desligando a escuta do DOM

A alternativa cotada na issue era acrescentar `setButtonState(botao,
pressionado)` ao contrato e desligar a escuta de DOM do RetroArch, dirigindo
o core por `pressDown`/`pressUp` a cada mudança.

Tecnicamente funciona — é a mesma API que decidimos usar para a tradução.
Mas desligar a escuta de DOM de verdade exige impedir que o `keydown` físico
alcance o listener que o RetroArch registrou no canvas (hoje ele chega por
bolha, do `palco` focado até o canvas, e nosso `preventDefault()` não
impede outros ouvintes de processar o mesmo evento). Isso significa capturar
o evento antes da fase de alvo — `stopPropagation` num ouvinte em fase de
captura acima do canvas — só para impedir um caminho que, com a configuração
certa, já produz o resultado certo. E ainda sobra o trabalho de reescrever
`EntradaDeTeclado`/`useKeyboardInput` para chamar `pressDown`/`pressUp` a
cada transição, duplicando por cima do que o SDL do RetroArch já faz sozinho,
bem, e mais barato — inclusive em latência, porque física direta no core não
passa por um ciclo de render do React no meio.

Guardamos isto como saída de emergência: se um dia precisarmos que o input
não dependa de o RetroArch estar processando `retroarch.cfg` — por exemplo,
input sintético de replay, ou um console cujo core não exponha
`input_playerN_*` — a issue #36 já mapeou o caminho.

### Por que a legenda para de poder mentir

Antes: `MAPA_PADRAO_DE_TECLADO` em `apps/web` e o padrão de fábrica do
RetroArch eram dois objetos que por acaso tinham os mesmos pares. Depois:
existe um mapa só, em `packages/emulator-runtime`, e tanto a legenda quanto
o `retroarchConfig` do boot leem dele. Não é mais possível editar a legenda
sem editar o que o core obedece, porque não há uma segunda tabela para
divergir.

O teste que fecha o critério de aceite mora em
`packages/emulator-runtime/src/snes/keyboard-bindings.test.ts`: prova que
`configDeTecladoDoRetroArch(MAPA_PADRAO_DE_TECLADO)` produz, para cada botão
do mapa, o par `input_player1_<botao>` com o nome de tecla do RetroArch
correspondente — e `snes-emulator-adapter.test.ts` prova que é exatamente
esse objeto que chega em `Nostalgist.prepare`. Editar uma linha de
`MAPA_PADRAO_DE_TECLADO` sem também ensinar `NOME_NO_RETROARCH` a traduzir a
tecla nova estoura em `configDeTecladoDoRetroArch`, em vez de silenciosamente
desenhar uma legenda que o jogo não segue.

## Consequências

**Fica mais fácil**

- **Remapeamento da M7 é gerar `configDeTecladoDoRetroArch` a partir de um
  mapa diferente** e reiniciar a sessão com ele como `retroarchConfig` — sem
  tocar no contrato, no player nem no `SnesEmulatorAdapter` além da chamada
  que já existe.
- **Zero reescrita da camada de input do `apps/web`.** `EntradaDeTeclado`,
  `useKeyboardInput` e `useEntradaDoJogador` continuam existindo exatamente
  como estão — eles nunca dirigiram o core, e continuam não dirigindo. O que
  mudou é que o que eles desenham deixou de poder divergir do que acontece.
- **O contrato `EmulatorAdapter` continua sem método de input.** Nenhum
  adapter futuro (Mega Drive, Game Boy) é obrigado a implementar simulação de
  botão só porque o SNES simula — porque o SNES também não simula.

**Fica mais difícil**

- **O contrato de teclado do RetroArch é sintaxe documentada, mas ainda é
  RetroArch — não nosso.** Se uma atualização de core mudar o parser de
  `input_player1_*` ou os nomes aceitos, a regressão aparece como tecla que
  para de responder, e só um teste em navegador real (não os testes de
  unidade daqui) pega isso. É o mesmo tipo de risco que a ADR 0015 já assumiu
  para o áudio.
- **Gamepad continua sem solução.** `comandos.definirGamepad` era um no-op
  disfarçado de funcionalidade; agora é código que não existe. Isso é
  honesto, mas não resolve #21/PR #35: o `navigator.getGamepads()` do
  RetroArch usa o mapeamento padrão W3C, que garante os controles
  **padrão** por especificação (não por coincidência) — mas
  `gamepad-map.ts` também remapeia controles fora do padrão
  (`playstation-legado`, `retro-generico`), e esses remapeamentos não têm
  como chegar no core: `retroarchConfig` é escrito no boot, antes de
  qualquer controle plugado ser identificado. Continua uma coincidência real
  para esse subconjunto de hardware — registrada aqui, não resolvida.
- **`respondToGlobalEvents: false` e o foco do canvas continuam um detalhe
  implícito do Nostalgist do qual dependemos.** É ele quem garante que o
  teclado físico chega ao core meio de o canvas roubar o foco no boot; a ADR
  não muda esse mecanismo, só passa a configurar o que ele lê.

## Alternativas descartadas

### (a) `setButtonState` por quadro, desligando a escuta de DOM

Descartada acima: tecnicamente viável com `pressDown`/`pressUp`, mas exige
capturar e bloquear o `keydown` físico antes que o listener do RetroArch no
canvas o veja, e reescreve por cima de um caminho que o SDL do RetroArch já
percorre sozinho — mais código, mais latência, para o mesmo resultado que a
configuração já entrega.

### Ler a memória do RetroArch para inferir o que o core realmente mapeia

Cogitado como forma de "verificar de fora" que a legenda bate com o core.
Descartado: o canal de comando é um por quadro (ADR 0008), já disputado por
save state, screenshot e leitura de memória, e não existe comando de
`retroarch.cfg` para consulta — o dado já está acessível sem RPC nenhuma,
é só ler o mesmo mapa duas vezes. Inventar um canal para verificar o que a
configuração já garante por construção seria indireção sem cliente.

### Reescrever a camada de input do `apps/web` para não existir

Já que o core lê o DOM, cogitou-se remover `EntradaDeTeclado` e desenhar a
legenda estaticamente. Descartada porque a legenda muda com o mapa (M7) e com
o controle conectado (`gamepad-map.ts`), e o `EstadoDoGamepad` computado
também alimenta os atalhos do HUD (`Space`, `F2`, `F4`, ...) por
`useKeyboardInput`. A camada continua com trabalho real a fazer — só não é
mais quem decide o que o jogo obedece.
