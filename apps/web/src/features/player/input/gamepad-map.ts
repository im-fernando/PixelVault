import { gamepadCom, type BotaoDoSnes, type EstadoDoGamepad } from './snes-keymap.js';

/**
 * O pedaço de `Gamepad` que nos interessa.
 *
 * Estrutural pelo mesmo motivo de `EventoDeTecla`: traduzir controle em botão
 * do SNES é lógica pura, e um `Gamepad` de verdade só existe num navegador com
 * hardware plugado. Um `Gamepad` real satisfaz esta interface como está.
 */
export interface BotaoDoControle {
  readonly pressed: boolean;
  readonly value: number;
}

export interface LeituraDoControle {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: readonly BotaoDoControle[];
  readonly axes: readonly number[];
}

/**
 * Meia deflexão para o eixo virar direção.
 *
 * É zona morta e limiar ao mesmo tempo, porque na tradução para direcional os
 * dois são a mesma pergunta. Analógico gasto descansa longe do centro: com
 * limiar baixo, o Mario anda sozinho para a esquerda com a mão fora do
 * controle. Na diagonal cheia cada eixo marca 0,707, então 0,5 continua
 * deixando a diagonal passar — que é o que faz correr na diagonal funcionar.
 */
export const ZONA_MORTA_PADRAO = 0.5;

/**
 * Gatilho analógico conta como apertado a partir da metade do curso.
 *
 * `pressed` existe, mas nem todo driver o preenche para os gatilhos de curso
 * longo: sem isto, o L do Xbox no gatilho de baixo simplesmente não responde.
 */
const CURSO_DO_GATILHO = 0.5;

export type FamiliaDeControle = 'xbox' | 'playstation' | 'nintendo' | 'generico';

/**
 * O layout é o que decide onde cada botão está; a família decide só como ele se
 * chama na legenda.
 *
 * `padrao` é o mapeamento W3C, que Xbox, DualShock 4, DualSense e 8BitDo em
 * modo X-input reportam como `mapping: 'standard'`.
 */
export type LayoutDeControle = 'padrao' | 'playstation-legado' | 'retro-generico';

type FonteDoDirecional =
  | {
      readonly tipo: 'botoes';
      readonly cima: number;
      readonly baixo: number;
      readonly esquerda: number;
      readonly direita: number;
    }
  | { readonly tipo: 'eixos'; readonly x: number; readonly y: number }
  | { readonly tipo: 'chapeu'; readonly eixo: number };

export interface PerfilDoControle {
  /** Posição em `navigator.getGamepads()`. É a identidade do controle na sessão. */
  readonly index: number;
  readonly id: string;
  /** O `id` sem o ruído de vendor e produto, para a UI. */
  readonly nome: string;
  readonly familia: FamiliaDeControle;
  readonly layout: LayoutDeControle;
  readonly botoes: ReadonlyMap<number, BotaoDoSnes>;
  readonly direcionais: readonly FonteDoDirecional[];
}

/**
 * Direcional digital e analógico esquerdo, os dois valendo.
 *
 * Não é indecisão: quem joga plataforma quer o direcional, quem joga corrida
 * quer o analógico, e nenhum dos dois quer descobrir num menu qual está ligado.
 */
const DIRECIONAL_PADRAO: readonly FonteDoDirecional[] = Object.freeze([
  { tipo: 'botoes', cima: 12, baixo: 13, esquerda: 14, direita: 15 } as const,
  { tipo: 'eixos', x: 0, y: 1 } as const,
]);

/**
 * O mapeamento é posicional, e é por isso que serve para todo mundo.
 *
 * O SNES tem B embaixo, A à direita, Y à esquerda e X em cima — exatamente as
 * posições 0, 1, 2 e 3 do mapeamento padrão. O Xbox chama a de baixo de A e o
 * DualShock chama de ✕, mas as duas ficam no mesmo lugar do polegar, e é o
 * lugar que o dedo procura. Traduzir por nome faria o pulo do Mario mudar de
 * botão conforme a marca do controle.
 *
 * Os gatilhos de baixo (6 e 7) repetem L e R de propósito: o SNES não tem o que
 * pôr neles, e dedo que aperta L2 esperando L não está errado.
 */
const BOTOES_PADRAO: ReadonlyMap<number, BotaoDoSnes> = new Map([
  [0, 'b'],
  [1, 'a'],
  [2, 'y'],
  [3, 'x'],
  [4, 'l'],
  [5, 'r'],
  [6, 'l'],
  [7, 'r'],
  [8, 'select'],
  [9, 'start'],
] as const);

/**
 * DualShock/DualSense sem mapeamento padrão.
 *
 * Acontece quando o navegador não reconhece o controle e entrega a ordem crua
 * do HID: ali a face começa em □ e não em ✕, o que desloca os quatro botões de
 * ação em relação ao padrão W3C. O direcional some dos botões e vira um chapéu
 * no eixo 9.
 */
const BOTOES_PLAYSTATION_LEGADO: ReadonlyMap<number, BotaoDoSnes> = new Map([
  [0, 'y'],
  [1, 'b'],
  [2, 'a'],
  [3, 'x'],
  [4, 'l'],
  [5, 'r'],
  [6, 'l'],
  [7, 'r'],
  [8, 'select'],
  [9, 'start'],
] as const);

const DIRECIONAL_PLAYSTATION_LEGADO: readonly FonteDoDirecional[] = Object.freeze([
  { tipo: 'chapeu', eixo: 9 } as const,
  { tipo: 'eixos', x: 0, y: 1 } as const,
]);

const PADROES_DE_FAMILIA: readonly (readonly [RegExp, FamiliaDeControle])[] = Object.freeze([
  [/x-?box|xinput|vendor:\s*045e/i, 'xbox'] as const,
  [
    /dual\s?sense|dual\s?shock|playstation|\bps[2345]\b|wireless controller|vendor:\s*054c/i,
    'playstation',
  ] as const,
  [/nintendo|switch|joy-?con|8bitdo|vendor:\s*(057e|2dc8)/i, 'nintendo'] as const,
]);

export function familiaDoControle(id: string): FamiliaDeControle {
  for (const [padrao, familia] of PADROES_DE_FAMILIA) {
    if (padrao.test(id)) return familia;
  }
  return 'generico';
}

/**
 * O nome que a pessoa reconhece, tirado do `id` do navegador.
 *
 * O Chrome anexa `(STANDARD GAMEPAD Vendor: 045e Product: 028e)` e o Firefox
 * prefixa `045e-028e-`. Nenhum dos dois ajuda quem só quer saber se o controle
 * que está na mão é o que o jogo está lendo.
 */
export function nomeDoControle(id: string): string {
  const semPrefixo = id.replace(/^\s*[0-9a-f]{4}-[0-9a-f]{4}-/i, '');
  const semSufixo = semPrefixo.replace(/\s*\([^)]*\)\s*$/, '').trim();
  return semSufixo.length > 0 ? semSufixo : 'Controle';
}

/**
 * Decide o layout uma vez, quando o controle aparece.
 *
 * Uma vez e não a cada quadro porque a resposta não muda enquanto o mesmo
 * controle estiver plugado — e porque expressão regular sessenta vezes por
 * segundo é trabalho que o quadro não tem para dar.
 */
export function perfilDoControle(leitura: LeituraDoControle): PerfilDoControle {
  const familia = familiaDoControle(leitura.id);
  const layout = identificarLayout(leitura, familia);

  return Object.freeze({
    index: leitura.index,
    id: leitura.id,
    nome: nomeDoControle(leitura.id),
    familia,
    layout,
    botoes: botoesDoLayout(layout, leitura.buttons.length),
    direcionais:
      layout === 'playstation-legado' ? DIRECIONAL_PLAYSTATION_LEGADO : DIRECIONAL_PADRAO,
  });
}

function identificarLayout(
  leitura: LeituraDoControle,
  familia: FamiliaDeControle,
): LayoutDeControle {
  if (leitura.mapping === 'standard') return 'padrao';
  if (familia === 'playstation') return 'playstation-legado';
  return 'retro-generico';
}

function botoesDoLayout(
  layout: LayoutDeControle,
  quantidade: number,
): ReadonlyMap<number, BotaoDoSnes> {
  if (layout === 'playstation-legado') return BOTOES_PLAYSTATION_LEGADO;
  if (layout === 'padrao') return BOTOES_PADRAO;

  // Clone USB de SNES: oito botões, e aí Select e Start caem em 6 e 7 porque
  // não há gatilho analógico nem analógico nenhum para ocupar as posições. Ler
  // 8 e 9 num controle que não os tem seria deixar Start sem botão.
  if (quantidade > 9) return BOTOES_PADRAO;
  return new Map([
    [0, 'b'],
    [1, 'a'],
    [2, 'y'],
    [3, 'x'],
    [4, 'l'],
    [5, 'r'],
    [6, 'select'],
    [7, 'start'],
  ] as const);
}

/**
 * As oito direções de um chapéu, no sentido horário a partir do norte.
 *
 * O eixo carrega a direção codificada de -1 a 1 em passos de 1/7, e a posição
 * de repouso é um valor **fora** desse intervalo — normalmente 1,28. Tratar o
 * repouso como um valor qualquer faria o controle parado apontar para cima e à
 * esquerda para sempre.
 */
const DIRECOES_DO_CHAPEU: readonly (readonly BotaoDoSnes[])[] = Object.freeze([
  ['up'],
  ['up', 'right'],
  ['right'],
  ['right', 'down'],
  ['down'],
  ['down', 'left'],
  ['left'],
  ['left', 'up'],
]);

function direcoesDoChapeu(valor: number): readonly BotaoDoSnes[] {
  if (!Number.isFinite(valor) || valor < -1.05 || valor > 1.05) return [];
  return DIRECOES_DO_CHAPEU[Math.round((valor + 1) * 3.5)] ?? [];
}

/**
 * O estado dos doze botões do SNES a partir de uma leitura do controle.
 *
 * Função pura, com o perfil vindo de fora: é o que permite provar o mapeamento
 * de um DualSense, de um clone de oito botões e de um chapéu em repouso sem
 * nenhum dos três estar plugado na máquina.
 */
export function traduzirControle(
  leitura: LeituraDoControle,
  perfil: PerfilDoControle,
  zonaMorta: number = ZONA_MORTA_PADRAO,
): EstadoDoGamepad {
  const pressionados = new Set<BotaoDoSnes>();

  for (const [indice, botao] of perfil.botoes) {
    const fisico = leitura.buttons[indice];
    if (fisico === undefined) continue;
    if (fisico.pressed || fisico.value >= CURSO_DO_GATILHO) pressionados.add(botao);
  }

  for (const fonte of perfil.direcionais) {
    if (fonte.tipo === 'botoes') {
      if (leitura.buttons[fonte.cima]?.pressed === true) pressionados.add('up');
      if (leitura.buttons[fonte.baixo]?.pressed === true) pressionados.add('down');
      if (leitura.buttons[fonte.esquerda]?.pressed === true) pressionados.add('left');
      if (leitura.buttons[fonte.direita]?.pressed === true) pressionados.add('right');
      continue;
    }

    if (fonte.tipo === 'chapeu') {
      for (const direcao of direcoesDoChapeu(leitura.axes[fonte.eixo] ?? Number.NaN)) {
        pressionados.add(direcao);
      }
      continue;
    }

    const x = leitura.axes[fonte.x] ?? 0;
    const y = leitura.axes[fonte.y] ?? 0;
    if (x <= -zonaMorta) pressionados.add('left');
    if (x >= zonaMorta) pressionados.add('right');
    // Y cresce para baixo no mapeamento padrão, como no resto da plataforma web.
    if (y <= -zonaMorta) pressionados.add('up');
    if (y >= zonaMorta) pressionados.add('down');
  }

  return gamepadCom(pressionados);
}

const DIRECIONAL_NA_LEGENDA: Readonly<Record<'up' | 'down' | 'left' | 'right', string>> =
  Object.freeze({ up: '↑', down: '↓', left: '←', right: '→' });

const ACAO_POR_FAMILIA: Readonly<
  Record<
    FamiliaDeControle,
    Readonly<Record<Exclude<BotaoDoSnes, 'up' | 'down' | 'left' | 'right'>, string>>
  >
> = Object.freeze({
  xbox: { b: 'A', a: 'B', y: 'X', x: 'Y', l: 'LB', r: 'RB', select: 'View', start: 'Menu' },
  playstation: {
    b: '✕',
    a: '○',
    y: '□',
    x: '△',
    l: 'L1',
    r: 'R1',
    select: 'Share',
    start: 'Options',
  },
  nintendo: { b: 'B', a: 'A', y: 'Y', x: 'X', l: 'L', r: 'R', select: '−', start: '+' },
  generico: { b: 'B', a: 'A', y: 'Y', x: 'X', l: 'L', r: 'R', select: 'Select', start: 'Start' },
});

/**
 * Como cada botão do SNES se chama **naquele** controle.
 *
 * A legenda que diz "aperte B" enquanto o dedo procura um botão escrito B num
 * DualSense manda a pessoa para o botão errado: lá o mesmo lugar é o ✕.
 */
export function rotulosDoControle(
  familia: FamiliaDeControle,
): Readonly<Record<BotaoDoSnes, string>> {
  return Object.freeze({ ...DIRECIONAL_NA_LEGENDA, ...ACAO_POR_FAMILIA[familia] });
}
