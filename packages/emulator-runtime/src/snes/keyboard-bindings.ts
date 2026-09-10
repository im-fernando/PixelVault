/**
 * O mapa de teclado do SNES, e a tradução dele para o que o RetroArch entende.
 *
 * Até a issue #36 este mapa só existia em `apps/web`, para desenhar a legenda
 * na tela — e o RetroArch escutava o teclado do DOM por conta própria, com o
 * mapa padrão dele, que por coincidência é igual a este. Nada garantia que os
 * dois continuassem iguais: editar uma linha da legenda não mudava o jogo, e a
 * tela passava a mentir sobre o que o botão fazia de verdade.
 *
 * Agora o mapa mora aqui, ao lado do adapter que o usa para montar o
 * `retroarchConfig` do boot (ver `SnesEmulatorAdapter`), e `apps/web` importa
 * o mesmo objeto para a legenda. Só existe um mapa — divergir deixou de ser
 * possível. Ver ADR 0023.
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

/**
 * `KeyboardEvent.code` das teclas especiais para o nome que o `retroarch.cfg`
 * entende. Não é detalhe de implementação do Nostalgist: é a sintaxe
 * documentada do RetroArch para `input_playerN_*`.
 *
 * Letra sozinha (`KeyA`..`KeyZ`) não entra aqui — vira o próprio nome em
 * minúsculo, regra geral de baixo em `codeNoRetroArch`. Isto cobre só as
 * teclas nomeadas que `MAPA_PADRAO_DE_TECLADO` usa; um `code` que não é letra
 * e não está aqui estoura em `configDeTecladoDoRetroArch`, e não em silêncio.
 */
const NOMES_ESPECIAIS_NO_RETROARCH: Readonly<Record<string, string>> = Object.freeze({
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ShiftRight: 'rshift',
  Enter: 'enter',
});

/**
 * `KeyboardEvent.code` → nome de tecla do RetroArch, ou `undefined` se este
 * módulo não sabe traduzir o `code`.
 */
function codeNoRetroArch(code: string): string | undefined {
  const especial = NOMES_ESPECIAIS_NO_RETROARCH[code];
  if (especial !== undefined) return especial;
  // "Will recognize letters (a to z)": qualquer `KeyX` vale por si, em
  // minúsculo — é a mesma regra que o RetroArch documenta para o teclado.
  const letra = /^Key([A-Z])$/.exec(code);
  if (letra?.[1] !== undefined) return letra[1].toLowerCase();
  return undefined;
}

/**
 * Traduz um mapa de teclado em `input_player1_*` de `retroarchConfig`.
 *
 * É a peça que fecha o contrato da issue #36: o `SnesEmulatorAdapter` manda
 * isto no boot, e o core passa a obedecer exatamente o mapa que a legenda
 * mostra — não o padrão dele, o nosso, explícito. Remapear na M7 é gerar este
 * objeto a partir de um mapa diferente e reiniciar a sessão com ele.
 */
export function configDeTecladoDoRetroArch(
  mapa: Readonly<Record<string, BotaoDoSnes>> = MAPA_PADRAO_DE_TECLADO,
): Readonly<Record<string, string>> {
  const config: Record<string, string> = {};
  for (const [code, botao] of Object.entries(mapa)) {
    const nome = codeNoRetroArch(code);
    if (nome === undefined) {
      throw new Error(
        `sem tradução de "${code}" para o RetroArch — ensine \`codeNoRetroArch\` ` +
          '(packages/emulator-runtime/src/snes/keyboard-bindings.ts)',
      );
    }
    config[`input_player1_${botao}`] = nome;
  }
  return Object.freeze(config);
}
