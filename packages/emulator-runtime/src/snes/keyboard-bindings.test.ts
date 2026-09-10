import { describe, expect, it } from 'vitest';
import {
  BOTOES_DO_SNES,
  MAPA_PADRAO_DE_TECLADO,
  configDeTecladoDoRetroArch,
  type BotaoDoSnes,
} from './keyboard-bindings.js';

describe('configDeTecladoDoRetroArch', () => {
  it('traduz o mapa padrão para o `input_player1_*` que o RetroArch documenta', () => {
    // Valores literais, e não derivados do mapa: é o teste que falha se a
    // tradução mudar de comportamento sem ninguém perceber — copiar a lógica
    // de `configDeTecladoDoRetroArch` aqui de volta provaria só que a função
    // concorda consigo mesma.
    expect(configDeTecladoDoRetroArch(MAPA_PADRAO_DE_TECLADO)).toEqual({
      input_player1_up: 'up',
      input_player1_down: 'down',
      input_player1_left: 'left',
      input_player1_right: 'right',
      input_player1_b: 'z',
      input_player1_a: 'x',
      input_player1_y: 'a',
      input_player1_x: 's',
      input_player1_l: 'q',
      input_player1_r: 'w',
      input_player1_select: 'rshift',
      input_player1_start: 'enter',
    });
  });

  it('usa o mapa padrão quando nenhum é passado — é o que o adapter chama no boot', () => {
    expect(configDeTecladoDoRetroArch()).toEqual(
      configDeTecladoDoRetroArch(MAPA_PADRAO_DE_TECLADO),
    );
  });

  it('cobre os doze botões do SNES, nem um a mais nem a menos', () => {
    const config = configDeTecladoDoRetroArch();
    const botoes = Object.keys(config).map((chave) => chave.replace('input_player1_', ''));
    expect(botoes.sort()).toEqual([...BOTOES_DO_SNES].sort());
  });

  it('recusa tecla sem tradução conhecida, em vez de mandar silêncio para o RetroArch', () => {
    const mapaComTeclaDesconhecida: Readonly<Record<string, BotaoDoSnes>> = {
      Digit1: 'b',
    };

    expect(() => configDeTecladoDoRetroArch(mapaComTeclaDesconhecida)).toThrowError(/Digit1/);
  });

  it('qualquer letra vale por si em minúsculo — é a regra do RetroArch, não uma tabela fixa', () => {
    expect(configDeTecladoDoRetroArch({ KeyJ: 'b' })).toEqual({ input_player1_b: 'j' });
  });

  it('remapear é só trocar o mapa de entrada — é o que a M7 precisa', () => {
    const remapeado: Readonly<Record<string, BotaoDoSnes>> = {
      ...MAPA_PADRAO_DE_TECLADO,
      KeyC: 'b',
    };
    delete (remapeado as Record<string, BotaoDoSnes>).KeyZ;

    expect(configDeTecladoDoRetroArch(remapeado).input_player1_b).toBe('c');
  });
});
