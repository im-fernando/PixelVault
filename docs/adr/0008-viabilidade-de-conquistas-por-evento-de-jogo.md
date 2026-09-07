# 0008. Habilitar conquistas por evento de jogo lendo a memória do console

Data: 2026-09-07
Status: aceita

## Contexto

Conquistas por evento de jogo (`boss_defeated`, `level_completed`) só existem se
der para ler a memória do console emulado a partir do JavaScript. Cores libretro
expõem isso ao frontend por `retro_get_memory_data`; a pergunta da issue #14 era
se algum runtime candidato repassa isso para o JS — e a resposta precisava vir na
M1, porque poderia mudar a escolha do runtime ([ADR 0011](0011-escolha-do-runtime-de-emulacao.md)).

As regras de gamificação foram desenhadas para **não** depender desta resposta: a
M6 sai de qualquer forma com a camada de conquistas de plataforma. Este spike
decide o teto, não a existência.

## Veredito: verde, com uma condição

**Dá para ler a memória do console a partir do JS, sem fork, sem build próprio e
sem pausar a emulação.** A condição é o core, não o runtime.

### O que existe e como funciona

O build emscripten do RetroArch — o mesmo que EmulatorJS e Nostalgist.js carregam
— expõe no objeto `Module` do Emscripten um par de funções que nenhum dos dois
projetos documenta:

- `Module.EmscriptenSendCommand(str)` enfileira um comando da interface de
  controle do RetroArch;
- `Module.EmscriptenReceiveCommandReply()` desenfileira a resposta.

Isso dá acesso a `READ_CORE_MEMORY <endereço hex> <bytes>` e
`WRITE_CORE_MEMORY <endereço hex> <bytes...>`, que é a mesma interface usada por
ferramentas externas de trapaça e de instrumentação.

Verificado no protótipo, com o Nostalgist rodando `snes9x2010`:

```
VERSION                          → "1.22.2"
READ_CORE_MEMORY 7e0000 32       → "00 00 00 00 00 00 00 00 00 00 00 00 00 43 00 5D …"
WRITE_CORE_MEMORY 7e1234 de ad be ef  → "4"      (4 bytes escritos)
READ_CORE_MEMORY 7e1234 4        → "DE AD BE EF"
```

A emulação não para para ser observada: o FPS não se move durante as leituras
(tabela adiante) e, numa das rodadas, duas leituras de `7e0100` separadas por 1
segundo devolveram bytes diferentes com o jogo rodando.

### A condição: o core precisa declarar memory maps

`READ_CORE_MEMORY` do RetroArch resolve o endereço pelos descritores que o core
publica via `RETRO_ENVIRONMENT_SET_MEMORY_MAPS`. Sem eles, a resposta é
` -1 no memory map defined`, que foi exatamente o que aconteceu com o `snes9x`.

| Core              | declara memory maps | `READ_CORE_MEMORY` no protótipo         |
| ----------------- | ------------------- | --------------------------------------- |
| `snes9x`          | não                 | `-1 no memory map defined` (verificado) |
| `snes9x2010`      | **sim**             | **bytes da WRAM** (verificado)          |
| `fceumm`          | sim                 | não testado                             |
| `genesis_plus_gx` | sim                 | não testado                             |
| `gambatte`        | sim                 | não testado                             |

Por isso a [ADR 0011](0011-escolha-do-runtime-de-emulacao.md) adota `snes9x2010`
como core padrão de SNES. É uma decisão de gamificação disfarçada de decisão de
emulação, e está registrada nos dois lugares de propósito.

O EmulatorJS carrega o mesmo RetroArch e tem o mesmo par de funções no `Module`
— o obstáculo lá é que o único core de SNES publicado no CDN dele é o `snes9x`.
A viabilidade é do RetroArch em WASM, não de um runtime específico.

## Decisão

Vamos construir a camada de conquistas por evento de jogo sobre
`READ_CORE_MEMORY`, amostrando a **10 Hz**, com o core `snes9x2010` para SNES.

O detector de evento fica no cliente, dentro do `packages/emulator-runtime`; o
servidor recebe o evento e decide se ele vale conquista. O cliente **não**
credita nada — o mesmo princípio de desconfiança que vale para playtime vale
aqui, porque `WRITE_CORE_MEMORY` mostra que qualquer usuário com o console do
navegador aberto pode forjar o estado que o detector observa.

A camada de conquistas de plataforma continua sendo a base. Conquistas de evento
são um segundo andar, por jogo, e só para os jogos em que alguém mapear os
endereços.

## Medição do impacto no FPS

Ambiente: Chrome for Testing 153.0.8010.12 (Playwright 1.63, headless), WebGL por
SwiftShader (software), áudio mudo; Nostalgist.js 0.22.0 com `snes9x2010` de
RetroArch 1.22.2; homebrew `horizontal-shooter.sfc` (MIT). Cada cenário rodou 8
segundos. O FPS é a contagem de iterações do laço principal do Emscripten, que
com vsync ligado equivale a um frame emulado por iteração.

| Amostragem | Bytes por leitura | FPS       | Respostas em 8 s | Volume lido |
| ---------- | ----------------- | --------- | ---------------- | ----------- |
| nenhuma    | —                 | **60,00** | 0                | —           |
| 1 Hz       | 64                | 59,99     | 7                | 1,5 kB      |
| 10 Hz      | 64                | 59,49     | 80               | 17 kB       |
| 30 Hz      | 64                | 58,87     | 242              | 51 kB       |
| 60 Hz      | 64                | 60,00     | 479              | 101 kB      |
| 60 Hz      | 1.024             | 60,00     | 481              | 1,4 MB      |
| 60 Hz      | 4.096             | 60,00     | 480              | 5,4 MB      |
| 60 Hz      | 32.768            | **60,00** | 480              | 40 MB       |
| 240 Hz     | 64                | 60,00     | **480**          | 7,6 MB      |
| nenhuma    | —                 | **60,00** | 0                | —           |

As quedas de 59,49 e 58,87 são ruído, não tendência: os cenários muito mais
pesados logo abaixo delas ficaram em 60,00 cravado, e uma rodada anterior deu
60,00 nessas mesmas linhas. Nem lendo 32 KB por frame — 40 MB de string
hexadecimal em 8 segundos — houve queda mensurável. A 10 Hz, que é o que a
decisão prevê, o custo desaparece no ruído.

**Teto do canal:** o RetroArch processa **um comando por frame**. A linha de
240 Hz devolveu as mesmas 480 respostas das linhas de 60 Hz; os outros ~1.440
comandos ficaram numa fila que cresce sem limite. O amostrador precisa ser preso
ao frame — um `setInterval` mais rápido que 60 Hz vaza memória em silêncio.

## Consequências

**Fica mais fácil**

- A camada de conquistas por evento existe, e existe sem fork de core, sem build
  próprio de WASM e sem `SharedArrayBuffer` (portanto sem COOP/COEP).
- O mesmo canal serve para telemetria de sessão mais rica que "tempo decorrido" —
  detectar que o jogador está de fato jogando, e não parado no menu.
- O mecanismo é o mesmo para NES, Mega Drive e Game Boy, cujos cores também
  declaram memory maps. A camada não é específica de SNES.

**Fica mais difícil**

- **Cada jogo é um trabalho manual.** Não existe base pública de endereços que
  possamos consumir direto; alguém precisa achar o endereço do contador de vidas
  de cada jogo. Conquistas de evento vão cobrir poucos jogos e vão crescer devagar.
- **Amarramos a M6 a um detalhe do RetroArch em WASM.** `EmscriptenSendCommand`
  não é API documentada nem do EmulatorJS nem do Nostalgist: é um símbolo do
  build do RetroArch. Uma atualização de core pode removê-lo sem aviso. Precisa
  virar teste de fumaça no CI da M6, não descoberta em produção.
- **O core que lê memória é o menos preciso.** Ver as consequências da
  [ADR 0011](0011-escolha-do-runtime-de-emulacao.md).
- **`WRITE_CORE_MEMORY` está disponível para quem abrir o console.** O detector
  roda no cliente e o cliente é hostil. Conquista de evento é sinal, não prova; a
  concessão é do servidor e as regras de desconfiança da ADR 0009 se aplicam
  igualmente aqui.
- **Teto de 60 leituras por segundo**, compartilhado com todo comando que
  mandarmos ao RetroArch (save state, screenshot, reset). O amostrador disputa
  fila com o resto do player.

## Plano B: só conquistas de plataforma

Registrado porque continua sendo o piso, não porque foi descartado.

Se o canal de leitura de memória sumir numa atualização de core, se o
`snes9x2010` se mostrar impróprio, ou se o custo de mapear endereços por jogo não
se pagar, a camada de conquistas de plataforma **sozinha** entrega a M6:

- horas jogadas (relógio do servidor)
- jogos distintos jogados
- tamanho da coleção
- streaks de dias
- primeiro save state, primeira ROM enviada, primeira sincronização

Nenhuma delas toca a memória do console — todas saem de dados que o servidor já
tem por outros motivos. Cair para o plano B custa remover uma feature, não
reescrever a M6.

## Alternativas descartadas

### Integrar o RetroAchievements que já vem no RetroArch

O build emscripten tem o rcheevos compilado dentro (as strings `cheevos_*` e
`RetroAchievements` estão no `.wasm`), e ele inicializa a memória por um caminho
próprio que **não** depende de memory maps: quando o core não declara nenhum,
o `rc_libretro_memory_init` cai para `retro_get_memory_data(RETRO_MEMORY_SYSTEM_RAM)`.
Ou seja, o RetroAchievements funcionaria até com o `snes9x`.

Descartado para a M6 assim mesmo, por três motivos:

1. É **fechado no RetroArch**. Ele desbloqueia, ele notifica na tela dele, e não
   devolve nada ao nosso JS. Não dá para alimentar a nossa tabela de conquistas
   com o que ele detecta.
2. Exige que cada usuário tenha e informe uma **conta do RetroAchievements**.
   Isso é uma segunda identidade dentro do produto, com tudo que vem junto.
3. Casar jogo por hash de ROM funciona no nosso modelo — o `catalog` já guarda
   hashes conhecidos ([ADR 0006](0006-byor-mais-catalogo-de-metadados.md)) — mas
   não resolve os dois pontos acima.

O caminho que faria sentido um dia é compilar o **rcheevos separado em WASM** e
alimentá-lo com as nossas leituras de `READ_CORE_MEMORY`, usando as definições
públicas de conquista do RetroAchievements. Aí o desbloqueio é nosso e o
catálogo é deles. É trabalho de uma milestone própria, não da M6.

### Ler o `HEAPU8` direto, procurando a WRAM

Dispensaria memory maps e liberaria o `snes9x`, que é mais preciso. Descartado
pelo mesmo motivo da [ADR 0011](0011-escolha-do-runtime-de-emulacao.md): o
endereço depende do layout do heap daquele build, e um deslocamento silencioso
não quebra, só passa a ler lixo.

### Inferir evento pelo save state

Comparar save states seguidos e deduzir o que mudou, sem ler memória. Descartado:
o save state é opaco e específico do core, comprimido, e capturá-lo a 10 Hz
custaria muito mais que uma leitura de 64 bytes — além de disputar a mesma fila
de um comando por frame.

## O que não foi verificado

- Nada foi medido em **GPU real**: o ambiente usou SwiftShader, renderização por
  software. O FPS ficou preso em 60,00 em todos os cenários, o que indica folga
  grande, mas não é a mesma coisa que medir num aparelho fraco.
- **Áudio não foi avaliado** (headless, sem placa de som). Estalo por
  concorrência do amostrador com o buffer de áudio continua uma incógnita.
- Não foi testado em **mobile nem em Safari**.
- Não houve leitura de um endereço com **significado conhecido** num jogo real —
  o homebrew usado não tem mapa de memória documentado. O que está provado é o
  canal (escrever `DE AD BE EF` e reler), não a detecção de um evento de jogo.
- **Nenhuma conta do RetroAchievements foi usada**; a análise do rcheevos veio da
  leitura do código do RetroArch 1.22.2 e das strings do `.wasm`, não de um
  desbloqueio real.
