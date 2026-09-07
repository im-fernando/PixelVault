import { describe, expect, it, vi } from 'vitest';
import { EntradaDeControle } from './gamepad-input.js';
import {
  familiaDoControle,
  nomeDoControle,
  perfilDoControle,
  rotulosDoControle,
  traduzirControle,
  type BotaoDoControle,
  type LeituraDoControle,
} from './gamepad-map.js';
import {
  combinarEstados,
  gamepadCom,
  type BotaoDoSnes,
  type EstadoDoGamepad,
} from './snes-keymap.js';

const ID_XBOX = 'Xbox 360 Controller (STANDARD GAMEPAD Vendor: 045e Product: 028e)';
const ID_DUALSENSE = 'DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)';
const ID_DUALSHOCK_CRU = '054c-09cc-Wireless Controller';
const ID_CLONE_USB = 'USB Gamepad (Vendor: 0079 Product: 0006)';

interface Ajustes {
  readonly id?: string;
  readonly index?: number;
  readonly mapping?: string;
  readonly connected?: boolean;
  readonly apertados?: readonly number[];
  readonly quantidadeDeBotoes?: number;
  readonly eixos?: readonly number[];
}

function leitura(ajustes: Ajustes = {}): LeituraDoControle {
  const quantidade = ajustes.quantidadeDeBotoes ?? 17;
  const apertados = new Set(ajustes.apertados ?? []);
  const buttons: BotaoDoControle[] = Array.from({ length: quantidade }, (_, indice) => ({
    pressed: apertados.has(indice),
    value: apertados.has(indice) ? 1 : 0,
  }));

  return {
    index: ajustes.index ?? 0,
    id: ajustes.id ?? ID_XBOX,
    mapping: ajustes.mapping ?? 'standard',
    connected: ajustes.connected ?? true,
    buttons,
    axes: ajustes.eixos ?? [0, 0, 0, 0],
  };
}

function traduzir(ajustes: Ajustes = {}): EstadoDoGamepad {
  const bruta = leitura(ajustes);
  return traduzirControle(bruta, perfilDoControle(bruta));
}

function apertados(estado: EstadoDoGamepad): string[] {
  return Object.entries(estado)
    .filter(([, aceso]) => aceso)
    .map(([botao]) => botao)
    .sort();
}

describe('mapeamento por layout', () => {
  it('mapeia por posição no polegar, não por letra: o botão de baixo é o B do SNES', () => {
    expect(traduzir({ apertados: [0] }).b).toBe(true);
    expect(traduzir({ apertados: [1] }).a).toBe(true);
    expect(traduzir({ apertados: [2] }).y).toBe(true);
    expect(traduzir({ apertados: [3] }).x).toBe(true);
  });

  it('DualSense e Xbox dão o mesmo botão do SNES no mesmo lugar do polegar', () => {
    const xbox = traduzir({ id: ID_XBOX, apertados: [0] });
    const sony = traduzir({ id: ID_DUALSENSE, apertados: [0] });
    expect(apertados(sony)).toEqual(apertados(xbox));
    expect(apertados(sony)).toEqual(['b']);
  });

  it('ombros e gatilhos analógicos caem os dois em L e R', () => {
    expect(traduzir({ apertados: [4] }).l).toBe(true);
    expect(traduzir({ apertados: [5] }).r).toBe(true);
    expect(traduzir({ apertados: [6] }).l).toBe(true);
    expect(traduzir({ apertados: [7] }).r).toBe(true);
  });

  it('gatilho que reporta curso sem reportar `pressed` ainda aperta o R', () => {
    const bruta = leitura();
    const comCurso: LeituraDoControle = {
      ...bruta,
      buttons: bruta.buttons.map((botao, indice) =>
        indice === 7 ? { pressed: false, value: 0.9 } : botao,
      ),
    };
    expect(traduzirControle(comCurso, perfilDoControle(comCurso)).r).toBe(true);
  });

  it('select e start no padrão ficam em 8 e 9', () => {
    expect(traduzir({ apertados: [8] }).select).toBe(true);
    expect(traduzir({ apertados: [9] }).start).toBe(true);
  });

  it('clone USB de oito botões põe select e start em 6 e 7', () => {
    const clone = { id: ID_CLONE_USB, mapping: '', quantidadeDeBotoes: 8 } as const;
    expect(perfilDoControle(leitura(clone)).layout).toBe('retro-generico');
    expect(traduzir({ ...clone, apertados: [6] }).select).toBe(true);
    expect(traduzir({ ...clone, apertados: [7] }).start).toBe(true);
  });

  it('DualShock sem mapeamento padrão tem a face deslocada: 1 é o ✕, que é o B', () => {
    const legado = { id: ID_DUALSHOCK_CRU, mapping: '' } as const;
    expect(perfilDoControle(leitura(legado)).layout).toBe('playstation-legado');
    expect(traduzir({ ...legado, apertados: [1] }).b).toBe(true);
    expect(traduzir({ ...legado, apertados: [0] }).y).toBe(true);
    expect(traduzir({ ...legado, apertados: [2] }).a).toBe(true);
  });
});

describe('direcional', () => {
  it('lê o D-pad digital', () => {
    expect(apertados(traduzir({ apertados: [12] }))).toEqual(['up']);
    expect(apertados(traduzir({ apertados: [13, 15] }))).toEqual(['down', 'right']);
  });

  it('o analógico esquerdo vale junto com o D-pad, sem menu para escolher', () => {
    expect(apertados(traduzir({ eixos: [-1, 0, 0, 0] }))).toEqual(['left']);
    expect(apertados(traduzir({ apertados: [12], eixos: [1, 0, 0, 0] }))).toEqual(['right', 'up']);
  });

  it('zona morta: analógico descansando fora do centro não anda sozinho', () => {
    expect(apertados(traduzir({ eixos: [0.3, -0.4, 0, 0] }))).toEqual([]);
    expect(apertados(traduzir({ eixos: [0.6, 0, 0, 0] }))).toEqual(['right']);
  });

  it('diagonal cheia passa nos dois eixos — correr na diagonal continua possível', () => {
    expect(apertados(traduzir({ eixos: [0.707, -0.707, 0, 0] }))).toEqual(['right', 'up']);
  });

  it('a zona morta é configurável para quem tiver analógico gasto', () => {
    const bruta = leitura({ eixos: [0.3, 0, 0, 0] });
    expect(traduzirControle(bruta, perfilDoControle(bruta), 0.2).right).toBe(true);
  });

  it('chapéu do DualShock legado: repouso fica fora do intervalo e não aponta nada', () => {
    const legado = { id: ID_DUALSHOCK_CRU, mapping: '' } as const;
    const chapeu = (valor: number): string[] =>
      apertados(traduzir({ ...legado, eixos: [0, 0, 0, 0, 0, 0, 0, 0, 0, valor] }));

    expect(chapeu(-1)).toEqual(['up']);
    expect(chapeu(-0.4285714)).toEqual(['right']);
    expect(chapeu(0.1428571)).toEqual(['down']);
    expect(chapeu(0.7142857)).toEqual(['left']);
    expect(chapeu(-0.7142857)).toEqual(['right', 'up']);
    expect(chapeu(1.2857143)).toEqual([]);
  });
});

describe('identificação do controle', () => {
  it('tira o ruído de vendor e produto do nome que vai para a tela', () => {
    expect(nomeDoControle(ID_XBOX)).toBe('Xbox 360 Controller');
    expect(nomeDoControle(ID_DUALSHOCK_CRU)).toBe('Wireless Controller');
    expect(nomeDoControle('')).toBe('Controle');
  });

  it('reconhece as famílias comuns pelo id', () => {
    expect(familiaDoControle(ID_XBOX)).toBe('xbox');
    expect(familiaDoControle(ID_DUALSENSE)).toBe('playstation');
    expect(familiaDoControle('8BitDo SN30 Pro')).toBe('nintendo');
    expect(familiaDoControle(ID_CLONE_USB)).toBe('generico');
  });

  it('a legenda chama o botão como o controle o chama', () => {
    expect(rotulosDoControle('xbox').b).toBe('A');
    expect(rotulosDoControle('playstation').b).toBe('✕');
    expect(rotulosDoControle('generico').b).toBe('B');
  });
});

describe('EntradaDeControle', () => {
  function bancada() {
    const aoMudar = vi.fn();
    const aoConectar = vi.fn();
    const aoDesconectar = vi.fn();
    const entrada = new EntradaDeControle({ aoMudar, aoConectar, aoDesconectar });
    entrada.definirAtiva(true);
    return { entrada, aoMudar, aoConectar, aoDesconectar };
  }

  it('sem controle nenhum, fica quieta — o fallback para teclado é não acontecer nada', () => {
    const { entrada, aoMudar, aoConectar } = bancada();
    entrada.sincronizar([null, null]);
    expect(entrada.controle).toBeNull();
    expect(aoMudar).not.toHaveBeenCalled();
    expect(aoConectar).not.toHaveBeenCalled();
  });

  it('detecta o controle que aparece no meio da partida', () => {
    const { entrada, aoConectar } = bancada();
    entrada.sincronizar([null]);
    entrada.sincronizar([leitura()]);

    expect(entrada.controle?.nome).toBe('Xbox 360 Controller');
    expect(aoConectar).toHaveBeenCalledTimes(1);
  });

  it('desconectar solta todos os botões antes de avisar — nada fica preso', () => {
    const { entrada, aoMudar, aoDesconectar } = bancada();
    entrada.sincronizar([leitura({ apertados: [15] })]);
    expect(entrada.estado().right).toBe(true);

    entrada.sincronizar([]);

    expect(entrada.estado().right).toBe(false);
    expect(entrada.controle).toBeNull();
    expect(aoDesconectar).toHaveBeenCalledTimes(1);
    // O último estado entregue ao console foi o de tudo solto, e ele chegou
    // antes do aviso: o jogo para de andar sem depender da UI.
    expect(apertados(aoMudar.mock.calls.at(-1)?.[0] as never)).toEqual([]);
    expect(aoMudar.mock.invocationCallOrder.at(-1)).toBeLessThan(
      aoDesconectar.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('controle com connected falso conta como desconectado', () => {
    const { entrada } = bancada();
    entrada.sincronizar([leitura()]);
    entrada.sincronizar([leitura({ connected: false })]);
    expect(entrada.controle).toBeNull();
  });

  it('não avisa mudança quando o quadro repete o estado anterior', () => {
    const { entrada, aoMudar } = bancada();
    entrada.sincronizar([leitura({ apertados: [0] })]);
    entrada.sincronizar([leitura({ apertados: [0] })]);
    entrada.sincronizar([leitura({ apertados: [0] })]);
    expect(aoMudar).toHaveBeenCalledTimes(1);
  });

  it('desligada, para de ler botão mas continua detectando o controle', () => {
    const { entrada, aoConectar } = bancada();
    entrada.definirAtiva(false);
    entrada.sincronizar([leitura({ apertados: [0] })]);

    expect(entrada.estado().b).toBe(false);
    expect(entrada.controle).not.toBeNull();
    expect(aoConectar).toHaveBeenCalledTimes(1);
  });

  it('desligar no meio do aperto solta o que estava pressionado', () => {
    const { entrada } = bancada();
    entrada.sincronizar([leitura({ apertados: [12] })]);
    entrada.definirAtiva(false);
    expect(entrada.estado().up).toBe(false);
  });

  it('um segundo controle não rouba a partida de quem já estava jogando', () => {
    const { entrada } = bancada();
    entrada.sincronizar([null, leitura({ index: 1, id: ID_DUALSENSE })]);
    expect(entrada.controle?.index).toBe(1);

    entrada.sincronizar([leitura({ index: 0 }), leitura({ index: 1, id: ID_DUALSENSE })]);
    expect(entrada.controle?.index).toBe(1);
  });

  it('quando o controle ativo cai, o outro que estiver plugado assume', () => {
    const { entrada, aoConectar, aoDesconectar } = bancada();
    entrada.sincronizar([leitura({ index: 0 }), leitura({ index: 1, id: ID_DUALSENSE })]);
    entrada.sincronizar([null, leitura({ index: 1, id: ID_DUALSENSE })]);

    expect(entrada.controle?.index).toBe(1);
    expect(aoDesconectar).toHaveBeenCalledTimes(1);
    expect(aoConectar).toHaveBeenCalledTimes(2);
  });
});

describe('convivência com o teclado', () => {
  it('os dois somam: o botão apertado em qualquer fonte vale', () => {
    const doTeclado = gamepadCom(new Set<BotaoDoSnes>(['b']));
    const doControle = gamepadCom(new Set<BotaoDoSnes>(['right']));
    expect(apertados(combinarEstados(doTeclado, doControle))).toEqual(['b', 'right']);
  });

  it('soltar tudo numa fonte não solta o que a outra segura', () => {
    const bruta = leitura({ apertados: [15] });
    const doControle = traduzirControle(bruta, perfilDoControle(bruta));
    expect(apertados(combinarEstados(gamepadCom(new Set()), doControle))).toEqual(['right']);
  });
});
