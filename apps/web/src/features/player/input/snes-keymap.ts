/**
 * O gamepad de SNES e o mapa padrão de teclado.
 *
 * Os doze botões são a linguagem do console; a tecla é só o dialeto do
 * teclado. A separação existe porque o remapeamento configurável da M7 e o
 * gamepad USB vão falar a mesma linguagem — só trocam o dialeto.
 */
export const BOTOES_DO_SNES = [
  'up',
  'down',
  'left',
  'right',
  'b',
  'a',
  'y',
  'x',
  'l',
  'r',
  'select',
  'start',
] as const;

export type BotaoDoSnes = (typeof BOTOES_DO_SNES)[number];

/**
 * Mapa padrão, indexado por `KeyboardEvent.code` e não por `key`.
 *
 * `code` é a posição física da tecla. Com `key`, quem joga num teclado ABNT2,
 * AZERTY ou Dvorak descobre que "Z" ficou do outro lado do teclado — e o
 * layout do teclado não deveria mudar onde fica o botão B do controle.
 *
 * As escolhas seguem o padrão do RetroArch, que é o que quem já emula espera:
 * setas no direcional, Z/X/A/S nos quatro botões de ação, Q/W nos gatilhos.
 */
export const MAPA_PADRAO_DE_TECLADO: Readonly<Record<string, BotaoDoSnes>> = Object.freeze({
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  KeyZ: 'b',
  KeyX: 'a',
  KeyA: 'y',
  KeyS: 'x',
  KeyQ: 'l',
  KeyW: 'r',
  ShiftRight: 'select',
  Enter: 'start',
});

export interface DescricaoDeBotao {
  readonly botao: BotaoDoSnes;
  /** Como o botão é chamado no controle. */
  readonly rotulo: string;
  /** Como a tecla é impressa no teclado. */
  readonly tecla: string;
}

const NOMES_ESPECIAIS: Readonly<Record<string, string>> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  ShiftRight: 'Shift dir.',
  Enter: 'Enter',
};

/** Traduz o `code` para o que está escrito na tecla. */
export function nomeDaTecla(code: string): string {
  const especial = NOMES_ESPECIAIS[code];
  if (especial !== undefined) return especial;
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return code;
}

/**
 * O mapa em forma de lista, para a UI desenhar a legenda.
 *
 * Deriva do mapa, e não é uma segunda tabela escrita à mão: legenda que
 * diverge do mapa real é pior que legenda nenhuma.
 */
export const LEGENDA_DO_TECLADO: readonly DescricaoDeBotao[] = Object.freeze(
  (
    [
      ['up', 'Cima', 'ArrowUp'],
      ['down', 'Baixo', 'ArrowDown'],
      ['left', 'Esquerda', 'ArrowLeft'],
      ['right', 'Direita', 'ArrowRight'],
      ['b', 'B', 'KeyZ'],
      ['a', 'A', 'KeyX'],
      ['y', 'Y', 'KeyA'],
      ['x', 'X', 'KeyS'],
      ['l', 'L', 'KeyQ'],
      ['r', 'R', 'KeyW'],
      ['select', 'Select', 'ShiftRight'],
      ['start', 'Start', 'Enter'],
    ] as const
  ).map(([botao, rotulo, code]) => ({ botao, rotulo, tecla: nomeDaTecla(code) })),
);

/** Estado de todos os botões num instante. Congelado: é leitura, não gaveta. */
export type EstadoDoGamepad = Readonly<Record<BotaoDoSnes, boolean>>;

const SOLTO: EstadoDoGamepad = Object.freeze(
  Object.fromEntries(BOTOES_DO_SNES.map((botao) => [botao, false])),
) as EstadoDoGamepad;

export function gamepadSolto(): EstadoDoGamepad {
  return SOLTO;
}

/** O estado a partir do conjunto de botões pressionados. */
export function gamepadCom(pressionados: ReadonlySet<BotaoDoSnes>): EstadoDoGamepad {
  if (pressionados.size === 0) return SOLTO;
  return Object.freeze(
    Object.fromEntries(BOTOES_DO_SNES.map((botao) => [botao, pressionados.has(botao)])),
  ) as EstadoDoGamepad;
}

/**
 * Compara dois estados botão a botão.
 *
 * O controle é lido a cada quadro, e a cada quadro sai um objeto novo mesmo com
 * ninguém encostando nele. Sem esta comparação, sessenta vezes por segundo o
 * React renderizaria de novo e o core levaria doze escritas idênticas — só para
 * dizer que nada mudou.
 */
export function estadosIguais(a: EstadoDoGamepad, b: EstadoDoGamepad): boolean {
  if (a === b) return true;
  return BOTOES_DO_SNES.every((botao) => a[botao] === b[botao]);
}

/**
 * Une duas fontes de entrada no mesmo controle.
 *
 * União, e não precedência: com o controle em uma mão e a outra no teclado, o
 * botão pressionado em qualquer uma das duas vale. Uma fonte que desligasse a
 * outra transformaria encostar no teclado em soltar o direcional do controle.
 */
export function combinarEstados(a: EstadoDoGamepad, b: EstadoDoGamepad): EstadoDoGamepad {
  if (a === SOLTO) return b;
  if (b === SOLTO) return a;
  return gamepadCom(new Set(BOTOES_DO_SNES.filter((botao) => a[botao] || b[botao])));
}
