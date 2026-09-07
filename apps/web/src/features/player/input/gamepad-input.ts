import {
  perfilDoControle,
  traduzirControle,
  ZONA_MORTA_PADRAO,
  type LeituraDoControle,
  type PerfilDoControle,
} from './gamepad-map.js';
import { estadosIguais, gamepadSolto, type EstadoDoGamepad } from './snes-keymap.js';

export interface OpcoesDaEntradaDeControle {
  /** Chamado só quando algum dos doze botões muda de verdade. */
  readonly aoMudar?: (estado: EstadoDoGamepad) => void;
  readonly aoConectar?: (perfil: PerfilDoControle) => void;
  readonly aoDesconectar?: (perfil: PerfilDoControle) => void;
  readonly zonaMorta?: number;
}

/** O que `navigator.getGamepads()` devolve: posições vazias e tudo. */
export type LeituraDeControles = readonly (LeituraDoControle | null | undefined)[];

/**
 * Traduz o que os controles plugados estão fazendo em estado de gamepad.
 *
 * A Gamepad API não emite evento de botão: ninguém avisa que o A foi apertado,
 * o navegador só deixa perguntar. Então a classe não escuta nada — ela é
 * perguntada, uma vez por quadro, por quem tem o laço de vídeo. Ler fora do
 * ritmo do vídeo, num `setInterval`, é o que faz o pulo sair meio quadro
 * depois do dedo.
 *
 * A detecção de controle continua funcionando com a entrada desligada: o jogo
 * pausado não lê botão, mas o aviso de "controle conectado" precisa aparecer do
 * mesmo jeito.
 */
export class EntradaDeControle {
  readonly #aoMudar: ((estado: EstadoDoGamepad) => void) | undefined;
  readonly #aoConectar: ((perfil: PerfilDoControle) => void) | undefined;
  readonly #aoDesconectar: ((perfil: PerfilDoControle) => void) | undefined;
  readonly #zonaMorta: number;

  #perfil: PerfilDoControle | null = null;
  #estado: EstadoDoGamepad = gamepadSolto();
  #ativa = false;

  constructor(opcoes: OpcoesDaEntradaDeControle = {}) {
    this.#aoMudar = opcoes.aoMudar;
    this.#aoConectar = opcoes.aoConectar;
    this.#aoDesconectar = opcoes.aoDesconectar;
    this.#zonaMorta = opcoes.zonaMorta ?? ZONA_MORTA_PADRAO;
  }

  get ativa(): boolean {
    return this.#ativa;
  }

  /** O controle que está jogando, ou `null` quando só há teclado. */
  get controle(): PerfilDoControle | null {
    return this.#perfil;
  }

  estado(): EstadoDoGamepad {
    return this.#estado;
  }

  definirAtiva(valor: boolean): void {
    if (this.#ativa === valor) return;
    this.#ativa = valor;
    if (!valor) this.#aplicar(gamepadSolto());
  }

  /**
   * Um quadro de leitura.
   *
   * Aqui mora o critério de aceite da issue: o controle que some no meio da
   * partida solta todos os botões **antes** de ser anunciado como desconectado.
   * A ordem importa — desconectar com o direcional preso é o personagem
   * correndo contra a parede até a próxima tecla.
   */
  sincronizar(leituras: LeituraDeControles): void {
    const leitura = this.#escolher(leituras);

    if (leitura === null) {
      const anterior = this.#perfil;
      if (anterior === null) return;
      this.#perfil = null;
      this.#aplicar(gamepadSolto());
      this.#aoDesconectar?.(anterior);
      return;
    }

    if (this.#perfil === null || !this.#mesmoControle(leitura)) {
      const anterior = this.#perfil;
      this.#perfil = perfilDoControle(leitura);
      this.#aplicar(gamepadSolto());
      if (anterior !== null) this.#aoDesconectar?.(anterior);
      this.#aoConectar?.(this.#perfil);
    }

    this.#aplicar(
      this.#ativa ? traduzirControle(leitura, this.#perfil, this.#zonaMorta) : gamepadSolto(),
    );
  }

  /**
   * Um controle joga por vez, e é o que já estava jogando.
   *
   * Preferir o controle ativo em vez do primeiro da lista evita que ligar um
   * segundo controle — ou o navegador reordenar as posições — troque o controle
   * de quem está no meio da fase.
   */
  #escolher(leituras: LeituraDeControles): LeituraDoControle | null {
    const atual = this.#perfil;
    if (atual !== null) {
      for (const leitura of leituras) {
        if (leitura === null || leitura === undefined || !leitura.connected) continue;
        if (leitura.index === atual.index) return leitura;
      }
    }

    let escolhido: LeituraDoControle | null = null;
    for (const leitura of leituras) {
      if (leitura === null || leitura === undefined || !leitura.connected) continue;
      if (escolhido === null || leitura.index < escolhido.index) escolhido = leitura;
    }
    return escolhido;
  }

  #mesmoControle(leitura: LeituraDoControle): boolean {
    return this.#perfil?.index === leitura.index && this.#perfil.id === leitura.id;
  }

  #aplicar(estado: EstadoDoGamepad): void {
    if (estadosIguais(this.#estado, estado)) return;
    this.#estado = estado;
    this.#aoMudar?.(estado);
  }
}
