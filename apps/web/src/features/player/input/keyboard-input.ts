import {
  MAPA_PADRAO_DE_TECLADO,
  gamepadCom,
  type BotaoDoSnes,
  type EstadoDoGamepad,
} from './snes-keymap.js';

/**
 * O pedaço de `KeyboardEvent` que nos interessa.
 *
 * Estrutural de propósito: a tradução de tecla em botão é lógica pura, e
 * lógica pura não precisa de DOM para ser testada. Quem liga isto na janela é
 * o hook, em quinze linhas.
 */
export interface EventoDeTecla {
  readonly code: string;
  readonly repeat: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly altKey: boolean;
  readonly target?: EventTarget | null;
  preventDefault(): void;
}

export interface OpcoesDaEntrada {
  readonly mapa?: Readonly<Record<string, BotaoDoSnes>>;
  /** Chamado só quando o estado muda de verdade. */
  readonly aoMudar?: (estado: EstadoDoGamepad) => void;
}

/**
 * Traduz teclado em estado de gamepad.
 *
 * Estado, e não evento: o console lê os doze botões a cada quadro, então
 * "correr e pular ao mesmo tempo" não é um caso especial — é a consequência de
 * guardar um conjunto em vez de despachar a última tecla. Repetição automática
 * do sistema operacional é descartada pelo mesmo motivo: `repeat` significa
 * "a tecla continua pressionada", que é exatamente o que o conjunto já diz.
 */
export class EntradaDeTeclado {
  readonly #pressionados = new Set<BotaoDoSnes>();
  readonly #mapa: Readonly<Record<string, BotaoDoSnes>>;
  readonly #aoMudar: ((estado: EstadoDoGamepad) => void) | undefined;
  #ativa = false;

  constructor(opcoes: OpcoesDaEntrada = {}) {
    this.#mapa = opcoes.mapa ?? MAPA_PADRAO_DE_TECLADO;
    this.#aoMudar = opcoes.aoMudar;
  }

  get ativa(): boolean {
    return this.#ativa;
  }

  /**
   * Liga e desliga a camada inteira.
   *
   * Desligar solta tudo, e isso não é higiene: um botão que fica preso quando
   * a aba perde o foco é o jogo andando sozinho quando a pessoa volta.
   */
  definirAtiva(valor: boolean): void {
    if (this.#ativa === valor) return;
    this.#ativa = valor;
    if (!valor) this.soltarTudo();
  }

  /** Devolve `true` quando a tecla pertence ao controle — quem chama dá `preventDefault`. */
  pressionar(evento: EventoDeTecla): boolean {
    const botao = this.#botaoDe(evento);
    if (botao === null) return false;

    evento.preventDefault();
    if (evento.repeat) return true;
    if (this.#pressionados.has(botao)) return true;

    this.#pressionados.add(botao);
    this.#notificar();
    return true;
  }

  soltar(evento: EventoDeTecla): boolean {
    const botao = this.#botaoDe(evento);
    if (botao === null) return false;

    evento.preventDefault();
    if (!this.#pressionados.delete(botao)) return true;

    this.#notificar();
    return true;
  }

  soltarTudo(): void {
    if (this.#pressionados.size === 0) return;
    this.#pressionados.clear();
    this.#notificar();
  }

  estado(): EstadoDoGamepad {
    return gamepadCom(this.#pressionados);
  }

  #botaoDe(evento: EventoDeTecla): BotaoDoSnes | null {
    if (!this.#ativa) return null;
    // Com Ctrl, Alt ou Meta a tecla é do navegador, não do jogo: capturar
    // Ctrl+W para o gatilho R fecharia a aba de quem quis atirar.
    if (evento.ctrlKey || evento.metaKey || evento.altKey) return null;
    if (ehCampoDeTexto(evento.target ?? null)) return null;
    return this.#mapa[evento.code] ?? null;
  }

  #notificar(): void {
    this.#aoMudar?.(this.estado());
  }
}

/**
 * Campo de texto tem prioridade sobre o controle.
 *
 * Checagem estrutural, e não `instanceof HTMLElement`, porque este arquivo
 * roda em teste sem DOM — e porque `instanceof` erra quando o elemento vem de
 * outro documento.
 */
function ehCampoDeTexto(alvo: EventTarget | null): boolean {
  if (alvo === null || typeof alvo !== 'object') return false;
  const elemento = alvo as { tagName?: unknown; isContentEditable?: unknown };
  if (elemento.isContentEditable === true) return true;
  const tag = typeof elemento.tagName === 'string' ? elemento.tagName.toUpperCase() : '';
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}
