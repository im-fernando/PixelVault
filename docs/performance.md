# Performance da emulação

Este documento existe para que "está rodando a 60 fps?" tenha resposta com
número, e para que a próxima troca de core ou de estratégia de render possa ser
comparada com alguma coisa. Issue #26.

Duas regras sustentam tudo que vem abaixo:

1. **Frame pacing importa mais que FPS médio.** 60 fps com engasgo se joga pior
   que 58 estáveis. Um segundo com 59 quadros no ritmo e um de 100 ms fecha em
   60 fps redondos e é um segundo em que a pessoa viu o jogo travar. Por isso
   nada aqui reporta média sozinha: sempre com percentis, desvio padrão e
   contagem de atrasos.
2. **Baseline sem as condições registradas não serve para comparar.** Os
   números desta página valem para a máquina, o navegador e o modo de render
   descritos em [Ambiente](#ambiente-da-medição) — e para mais nada.

---

## O overlay de diagnóstico

Fica em `apps/web/src/features/player/debug/`. **Nasce desligado**: ele cobre o
canto da tela e o laço que o alimenta é trabalho por quadro que ninguém deveria
pagar sem pedir.

### Como ligar

| Caminho                       | Quando usar                                                                                                         |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| **`F3`** com o player em foco | Olhar o pacing durante a partida. Liga e desliga a qualquer momento e é lembrado no `sessionStorage`.               |
| **`?diagnostico=1`** na URL   | Medir. É o único caminho que pega o **tempo de carga** e o **áudio**, porque esses marcos acontecem durante o boot. |
| `?diagnostico=0`              | Desliga mesmo que a sessão tenha guardado ligado.                                                                   |

`F3` foi escolhido por eliminação: `Espaço`, `R`, `F2`, `F4` e `F` já são do
HUD, e o mapa de teclado do SNES ocupa as setas, `Z X A S`, `Q W`, `Shift
direito` e `Enter` (`input/snes-keymap.ts`). Sobra a faixa de teclas de função,
e `F3` é a tecla de painel de depuração que quem joga já conhece. Um teste
trava a escolha: `debug/diagnostics-flag.test.ts` falha se algum dia o mapa de
SNES ou os atalhos do HUD passarem por cima dela.

### O que cada linha significa

**Ritmo de apresentação** — medido pelo intervalo entre chamadas de
`requestAnimationFrame` do próprio player.

| Linha              | O que é                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- |
| `fps apresentados` | Quadros que o **navegador** apresentou por segundo, na janela de ~4 s (240 quadros).         |
| veredito           | `estável` / `irregular` / `engasgando`. Olha atraso e variância **antes** da média.          |
| gráfico            | Os últimos 120 intervalos, um traço cada. A linha tracejada é o orçamento de 16,7 ms.        |
| `frame time`       | Média e mediana do intervalo entre quadros.                                                  |
| `p95 / p99`        | A cauda. É onde o engasgo mora — a média nunca o mostra.                                     |
| `pior quadro`      | O maior intervalo da janela.                                                                 |
| `variância (σ)`    | Desvio padrão dos intervalos. É a medida de estabilidade do pacing.                          |
| `atrasados`        | Quadros que chegaram a 1,5× do orçamento ou pior, e quantas apresentações o navegador pulou. |
| `janela`           | Tamanho da amostra, mais as **interrupções** (pausas acima de 1 s: aba oculta, depurador).   |

**Emulação** — vem do evento `fps` do adapter, amostrado **1×/s** de propósito
(evento por quadro a 60 Hz custaria mais que a emulação;
`packages/emulator-runtime/src/adapter/events.ts`). É o contador de iterações do
laço do RetroArch: quantos quadros o **core** produziu, não quantos a tela
mostrou.

As duas taxas aparecem separadas porque a divergência é informação: core a 60
com apresentação a 30 é problema de render; core a 45 com apresentação a 60 é
problema de emulação.

**Carga** — `core` (baixar e preparar o `.js` e o `.wasm`), `ROM` (ler o arquivo
e montar a máquina), `1º quadro` e o total. Sai das transições de status do
adapter (`idle → loading → mounted → loading → ready → running`), com o instante
de cada uma vindo de `useEmulator`. Abaixo, uma linha por arquivo da Resource
Timing, dizendo se veio da **rede** ou do **cache** — sem essa distinção, medir
de novo com o cache quente vira uma "melhoria" de centenas de milissegundos que
ninguém fez.

**Áudio** — taxa de amostragem, estado e as duas latências de saída do
`AudioContext`, que são a profundidade do buffer vista de fora.

### O que o overlay não mede, e diz que não mede

- **Estalo e underrun de áudio.** O `EmulatorAdapter` não expõe o buffer do
  core; a sonda só alcança o que a plataforma publica. Latência alta e estável
  soa bem, underrun soa mal, e os dois dão a mesma leitura aqui. O buffer de
  verdade chega com o AudioWorklet da issue #25.
- **O instante exato do primeiro quadro de vídeo.** O runtime não conta quadro
  de vídeo. Quem marca é o `requestAnimationFrame` seguinte ao `start()`
  resolver, então há uma folga de um quadro (~17 ms) embutida no `1º quadro`.
- **Quadro emulado individualmente.** O evento `fps` é 1×/s. Um segundo em que
  o core produziu 60 quadros em rajada depois de uma pausa aparece como 60, e
  às vezes como 61 — o contador é de iterações do laço, não de tempo de console.

### O overlay custa quanto?

A medição roda a cada quadro; o React não. O painel se redesenha 4×/s, e o
gráfico é um `<path>` só, não 120 elementos — um medidor que provoca o engasgo
que ele reporta é pior que medidor nenhum.

Medido comparando o fps que o **adapter** reporta (independente do overlay) com
o painel aberto e fechado, quatro execuções de 40 s alternadas:

| Ordem | Painel  | mediana | média  | mínimo |
| ----- | ------- | ------- | ------ | ------ |
| 1     | fechado | 60,00   | 60,001 | 59,88  |
| 2     | aberto  | 60,00   | 60,000 | 59,80  |
| 3     | fechado | 60,00   | 59,954 | 58,23  |
| 4     | aberto  | 60,00   | 57,677 | 35,90  |

A mediana não muda em nenhum dos quatro. Nas duas primeiras execuções a média é
indistinguível (60,001 contra 60,000); a quarta caiu para 57,7 com um mínimo de
35,9, e a terceira — com o painel **fechado** — também degradou. O padrão é de
contenção do host acumulando ao longo da bateria, não de custo do painel.

**O registro honesto:** a mediana não muda; a média com o painel aberto ficou
entre 0,0 e 2,3 fps abaixo, e **não dá para separar esse custo do ruído da
máquina** (ver [limitações](#limitações-deste-baseline)). Se algum dia isso
importar de verdade, o overlay é o primeiro a ser fechado.

---

## Ambiente da medição

Tudo abaixo foi medido em **7 de setembro de 2026**.

| Item             | Valor                                                                       |
| ---------------- | --------------------------------------------------------------------------- |
| Máquina          | AMD Ryzen 7 5825U (8 núcleos / 16 threads), 15 GiB de RAM                   |
| GPU              | AMD Radeon integrada (Barcelo) — **não usada**, ver abaixo                  |
| Sistema          | Zorin OS 18.1, kernel Linux 7.0.0-30-generic, x86_64                        |
| Navegador        | Google Chrome for Testing 153.0.8010.12, **headless**, via Playwright       |
| Render           | `--use-gl=swiftshader --enable-unsafe-swiftshader` — **WebGL por software** |
| Áudio            | `--autoplay-policy=no-user-gesture-required`, saída para dispositivo nulo   |
| Runtime          | Nostalgist.js 0.22.0, core `snes9x2010@1.22.2` (RetroArch 1.22.2)           |
| Servidor         | `vite dev` e a API local, tudo em `localhost` — rede sem latência real      |
| Carga da máquina | `load average` entre 4 e 6 em 16 threads: a máquina **não estava ociosa**   |

**Jogo de referência:** `sure-instinct` — _Sure Instinct_ v1.0.2, de Benjamin
Schulte (BennySnesDev), MIT, vencedor do SNESdev Compo de 2021. São 524.288
bytes de ROM e 8 KB de SRAM com bateria. O arquivo está **versionado no
repositório** (`apps/web/public/roms/sure-instinct/sure-instinct.sfc`,
`sha256:73390b30a441ecc8042038f959b34e981ed8b5a0d9053b4d94d1dcd968a0f0ef`), então
o baseline pode ser refeito byte a byte por outra pessoa. Procedência completa
em [docs/homebrew.md](homebrew.md).

Foi escolhido como referência por juntar ROM de 512 KB, música e bateria: uma
partida exercita vídeo, áudio e o caminho de SRAM ao mesmo tempo. Um jogo sem
bateria — `super-sudoku`, por exemplo — não passaria pelo vigia de SRAM do
adapter, que roda a cada 5 s e é trabalho real.

---

## Baseline

### Ritmo, com o jogo rodando

Quatro execuções de 60 s cada, uma amostra por segundo (240 amostras). Cada
amostra é a estatística da janela de ~4 s que o overlay estava mostrando naquele
instante.

| Métrica                          | mediana das 4 execuções | pior valor visto |
| -------------------------------- | ----------------------- | ---------------- |
| FPS apresentados                 | **60,0**                | 59,26            |
| FPS emulados pelo core           | **60,0**                | 57,17            |
| Frame time médio                 | **16,67 ms**            | 16,87 ms         |
| Frame time mediano               | 16,7 ms                 | 16,7 ms          |
| p95                              | **16,7 ms**             | 16,8 ms          |
| p99                              | **16,8 ms**             | 33,3 ms          |
| Pior quadro                      | 16,8 ms                 | **33,4 ms**      |
| Desvio padrão (σ)                | **0,06 ms**             | 1,85 ms          |
| Quadros atrasados na janela      | **0** de 240            | 3 de 240         |
| Quadros de apresentação perdidos | **0**                   | 3                |

Veredito do overlay ao longo dos 240 segundos:

| Veredito     | Segundos | Proporção |
| ------------ | -------- | --------- |
| `estável`    | 202      | 84,2%     |
| `irregular`  | 38       | 15,8%     |
| `engasgando` | 0        | 0%        |

**Leitura:** o core entrega 60 quadros, o navegador apresenta 60, e o desvio
padrão de 0,06 ms diz que os quadros chegam praticamente no relógio. Nenhum
segundo recebeu veredito `engasgando`. Os 16% de `irregular` são janelas em que
um único quadro passou de 33 ms — é um vsync perdido isolado, não stutter
sustentado.

### O quanto o host mexe no número

Uma bateria anterior das mesmas quatro execuções, no mesmo jogo e no mesmo
ambiente, mas com a máquina compilando outras coisas em paralelo, deu **as
mesmas medianas** (60,0 fps, 16,67 ms) e um resultado completamente diferente na
cauda: 13% dos segundos com veredito `engasgando`, pior quadro de **100 ms** e
desvio padrão chegando a 6,6 ms.

Não é uma comparação controlada — a bateria anterior é de antes de o controle
por gamepad entrar. Mas a lição vale e é o motivo de o item 3 das
[limitações](#limitações-deste-baseline) existir: **a média não distingue as
duas situações; só a cauda distingue.** Que é exatamente por que este overlay
mostra p99, σ e contagem de atrasados, e por que comparar com este baseline sem
registrar a carga do host não significa nada.

### Outros homebrews do catálogo

Uma execução de 40 s cada, mesmas condições. Servem de contexto, não de
baseline: uma execução só não separa o jogo do ruído da máquina.

| Jogo                | FPS (mediana) | FPS (mínimo) | σ (mediana) | Pior quadro | Carga total |
| ------------------- | ------------- | ------------ | ----------- | ----------- | ----------- |
| `sure-instinct`     | 60,0          | 59,26        | 0,06 ms     | 33,4 ms     | 752–902 ms  |
| `castle-platformer` | 60,0          | 59,75        | 0,06 ms     | 33,3 ms     | 675 ms      |
| `euc-thrills`       | 60,0          | 59,75        | 0,06 ms     | 33,4 ms     | 685 ms      |
| `super-sudoku`      | 60,0          | 59,50        | 0,06 ms     | 33,3 ms     | 780 ms      |

Os quatro se comportam igual. Faz sentido: são homebrews, e nenhum deles
aproxima o teto de um cartucho comercial com chip de apoio. **Este baseline não
diz nada sobre um jogo com SuperFX ou SA-1** — o catálogo público não tem
nenhum, e o BYOR da M3 é que vai trazer o primeiro.

### Tempo de carga

Do momento em que o player monta até o primeiro quadro apresentado. Quatro
execuções com cache frio, uma com cache quente.

| Etapa                                   | Cache frio (4 execuções) | Cache quente |
| --------------------------------------- | ------------------------ | ------------ |
| Core (baixar `.js` + `.wasm`, preparar) | 150–172 ms               | 106 ms       |
| ROM (ler o arquivo, montar a máquina)   | 284–313 ms               | 320 ms       |
| Até o primeiro quadro                   | 309–429 ms               | 220 ms       |
| **Total**                               | **752–902 ms**           | **645 ms**   |

Rede, pela Resource Timing (cache frio):

| Arquivo                    | Tamanho | Duração |
| -------------------------- | ------- | ------- |
| `snes9x2010_libretro.wasm` | 3,95 MB | 136 ms  |
| `snes9x2010_libretro.js`   | 254 kB  | 7 ms    |
| `sure-instinct.sfc`        | 512 kB  | 5 ms    |

**Cuidado ao comparar:** os 136 ms do WASM são de `localhost`, sem latência,
sem perda e sem compressão de transporte. Numa conexão de verdade, os 3,95 MB
do core dominam a carga inteira e nada mais nesta tabela importa. O que esta
medição sustenta é o **custo de CPU** de subir o core (~150 ms para instanciar)
e de montar a máquina com a ROM (~300 ms) — não o custo de rede.

Também vale notar que o cache quente **não** encurta a etapa da ROM (320 ms
contra 284–313 ms com cache frio): o tempo ali é montar a máquina, e não buscar
meio mega de arquivo.

### Áudio

| Item               | Valor        |
| ------------------ | ------------ |
| Taxa de amostragem | 48.000 Hz    |
| Estado do contexto | `running`    |
| Latência base      | 10,7 ms      |
| Latência de saída  | 232 a 240 ms |

Uma latência de saída de ~240 ms é enorme para um jogo de ação — mas é o número
do dispositivo de áudio nulo do ambiente headless, não o de um aparelho real.
**Este número não vale como baseline.** O que vale registrar é que o contexto
sobe a 48 kHz e fica em `running` durante a partida inteira, e que a issue #25 é
quem vai medir buffer e underrun de verdade.

---

## Limitações deste baseline

Em ordem de quanto invalidam a leitura:

1. **É render por software.** SwiftShader é um rasterizador de CPU; a GPU da
   máquina não foi usada. Isso é herança do ambiente headless e é a mesma
   limitação que o [spike da M1](spikes/2026-09-m1-runtime-de-emulacao/) já
   tinha registrado. **O número em GPU real ainda não existe.** Vale notar que
   a superfície do SNES é 256×224: o rasterizador de software dá conta, e o
   gargalo aqui não é o render. Numa GPU real o comportamento pode ser melhor
   (composição em hardware) ou pior (perda de contexto, vsync de 144 Hz brigando
   com 60 Hz do console) — não sabemos.
2. **O Chrome headless usa um vsync sintético.** A regularidade que medimos —
   mediana de exatamente 16,7 ms com σ de 0,06 ms — é regular demais para uma
   tela física. O teto de 60 fps deste baseline é do harness, não prova de que
   uma tela de verdade apresentaria assim. **Os atrasos que aparecem são reais**
   (o trabalho estourou o orçamento do quadro); a ausência de jitter de base,
   não.
3. **A máquina não estava ociosa.** `load average` entre 4 e 6 em 16 threads
   durante as medições. Nesta bateria isso não estragou o resultado (nenhum
   segundo com `engasgando`), mas a bateria anterior, com compilações rodando
   junto, deu 13% de `engasgando` no mesmo jogo — ver [o quanto o host mexe no
   número](#o-quanto-o-host-mexe-no-número). **Sem registrar a carga do host, a
   comparação não vale.**
4. **Rede é `localhost`.** Ver a ressalva na tabela de carga.
5. **É desenvolvimento, não produção.** O front foi servido por `vite dev`, com
   módulos não empacotados e HMR ligado. O `pnpm build` gera um bundle bem
   diferente; o core em WASM é o mesmo binário nos dois casos, mas o custo de
   JavaScript da página não é.

## O que não foi medido

Não foi medido, e por isso não está estimado aqui:

- **GPU real, em navegador com janela.** É a próxima medição a fazer, e a que
  torna o item 1 acima obsoleto.
- **Máquina fraca.** Não temos aparelho de baixo desempenho à disposição. O que
  se pode dizer sem medir é qual eixo é o candidato: o `snes9x2010` é um core de
  CPU, então quem limita é o núcleo único, e não a GPU. Quanto disso sobra num
  Celeron ou num Chromebook é **desconhecido** — não é 30 fps nem 45 fps, é
  desconhecido.
- **Mobile.** Nem Android nem iOS. Além do desempenho, há duas coisas que a
  M1 não resolveu e que aparecem antes do fps: não existe controle por toque, e
  o Safari em iOS tem regras próprias de `AudioContext`. Medir fps num aparelho
  em que ainda não dá para jogar seria medir a coisa errada.
- **Safari e Firefox**, em qualquer plataforma.
- **Sessão longa.** A execução mais longa foi de 60 s. Vazamento de memória ao
  longo de uma hora de jogo não foi observado aqui — a medição que existe é a
  de dez ciclos de criar e destruir, na verificação em navegador do
  `emulator-runtime`, e ela registrou ~0,9 MB de heap por ciclo que não volta.
- **Underrun de áudio.** Ver a issue #25.

---

## Como reproduzir

```bash
pnpm install
pnpm emulator:setup          # baixa e confere o core por SHA-256
docker compose up -d
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev                     # web em :5173, API em :3333
```

Abra `http://localhost:5173/play/sure-instinct?diagnostico=1` e o painel já
está lá, com o tempo de carga preenchido. Para medir por script, o painel
publica em `window.__pixelvaultDiagnostico` **exatamente a mesma amostra que
desenha na tela** — não é uma segunda fonte de verdade, e ele só existe com o
painel aberto.

O harness abaixo é o que produziu as tabelas acima. Ele mora fora do
repositório de propósito, como o do spike: é descartável, e o que precisa
sobreviver são os números e as condições, que estão nesta página.

```bash
mkdir -p /tmp/pv-perf && cd /tmp/pv-perf
npm init -y && npm install playwright-core
```

```js
// /tmp/pv-perf/medir.mjs
import { chromium } from 'playwright-core';

const BASE = process.env.BASE ?? 'http://localhost:5173';
const SLUG = process.env.SLUG ?? 'sure-instinct';
const SEGUNDOS = Number(process.env.SEGUNDOS ?? 60);
const AQUECIMENTO = 8;

const navegador = await chromium.launch({
  executablePath: process.env.CHROME,
  args: [
    '--use-gl=swiftshader',
    '--enable-unsafe-swiftshader',
    '--autoplay-policy=no-user-gesture-required',
  ],
});
const pagina = await navegador.newPage();

await pagina.goto(`${BASE}/play/${SLUG}?diagnostico=1`);
await pagina.waitForFunction(() => window.__pixelvaultDiagnostico?.status === 'running');
// O primeiro quadro é marcado no rAF seguinte ao `running`: ler antes disso
// devolveria a linha do tempo pela metade.
await pagina.waitForTimeout(1500);
const carga = await pagina.evaluate(() => {
  const a = window.__pixelvaultDiagnostico;
  return { carga: a.carga, recursos: a.recursos, coreVersion: a.coreVersion };
});

await pagina.waitForTimeout(AQUECIMENTO * 1000);
const amostras = [];
for (let i = 0; i < SEGUNDOS; i += 1) {
  await pagina.waitForTimeout(1000);
  amostras.push(
    await pagina.evaluate(() => {
      const a = window.__pixelvaultDiagnostico;
      return { pacing: a.pacing, veredito: a.veredito, fpsDoCore: a.fpsDoCore, audio: a.audio };
    }),
  );
}

const resumo = (nome, lista) => {
  const ord = [...lista].sort((a, b) => a - b);
  const media = ord.reduce((s, v) => s + v, 0) / ord.length;
  return {
    nome,
    min: +ord[0].toFixed(2),
    mediana: +ord[Math.floor(ord.length / 2)].toFixed(2),
    media: +media.toFixed(2),
    max: +ord.at(-1).toFixed(2),
  };
};
const v = (f) => amostras.map(f);

console.log(
  JSON.stringify(
    {
      ...carga,
      audio: amostras.at(-1).audio,
      vereditos: amostras.reduce(
        (acc, a) => ({ ...acc, [a.veredito]: (acc[a.veredito] ?? 0) + 1 }),
        {},
      ),
      metricas: [
        resumo(
          'fps apresentados',
          v((a) => a.pacing.fps),
        ),
        resumo(
          'fps do core',
          v((a) => a.fpsDoCore),
        ),
        resumo(
          'frame time medio',
          v((a) => a.pacing.frameTimeMedioMs),
        ),
        resumo(
          'p95',
          v((a) => a.pacing.p95Ms),
        ),
        resumo(
          'p99',
          v((a) => a.pacing.p99Ms),
        ),
        resumo(
          'pior quadro',
          v((a) => a.pacing.piorMs),
        ),
        resumo(
          'desvio padrao',
          v((a) => a.pacing.desvioPadraoMs),
        ),
        resumo(
          'atrasados',
          v((a) => a.pacing.quadrosAtrasados),
        ),
      ],
    },
    null,
    2,
  ),
);
await navegador.close();
```

```bash
CHROME=$HOME/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome \
  node medir.mjs
```

Numa máquina ociosa e com uma GPU de verdade, repetir isto produz o baseline que
falta. Ao publicar, **registre as condições junto** — sem elas o número não
compara com nada.

---

## O que conta como regressão

Comparando com este baseline, na mesma máquina e no mesmo modo de render:

- **Mediana de FPS apresentados abaixo de 59,5.** O core deixou de acompanhar.
- **σ mediano acima de 0,5 ms.** Hoje é 0,06 ms; uma ordem de grandeza de piora
  é o pacing degradando mesmo com a média parada em 60 — que é exatamente o caso
  que esta página existe para pegar.
- **p99 mediano acima de 20 ms.** Hoje é 16,8 ms. A cauda cresceu: a pessoa está
  sentindo travadas.
- **Qualquer segundo com veredito `engasgando`** numa bateria em máquina com a
  mesma carga. Hoje são zero em 240.
- **Carga total acima de 1,2 s com cache frio em `localhost`**, ou o WASM do
  core passando de 4 MB.

Nenhum desses limites é sagrado; eles são o que este baseline sustenta hoje.
Quando existir medição em GPU real, este bloco muda junto.
