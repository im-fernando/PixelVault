import type { SystemId } from '@pixelvault/contracts';
import {
  EmulatorError,
  isEmulatorError,
  type EmulatorAdapter,
  type EmulatorRegistry,
  type EmulatorStatus,
  type RomSource,
  type Unsubscribe,
} from '@pixelvault/emulator-runtime';
import { temRelogioManual } from './adapter-extras.js';

export interface ObservadorDaSessao {
  readonly aoMudarStatus?: (status: EmulatorStatus) => void;
  readonly aoFalhar?: (erro: EmulatorError) => void;
  readonly aoMedirFps?: (fps: number) => void;
  readonly aoGravarSram?: (bytes: number) => void;
  /** O adapter existe e a ROM está carregada. É quando o HUD ganha capabilities. */
  readonly aoAbrir?: (adapter: EmulatorAdapter) => void;
}

export interface ParametrosDaSessao {
  readonly registry: EmulatorRegistry;
  readonly systemId: SystemId;
  readonly rom: RomSource;
  readonly canvas: HTMLCanvasElement;
  /** Falso quando a aba já está oculta no boot: playtime honesto começa aqui. */
  readonly iniciarAutomaticamente: boolean;
  readonly observador?: ObservadorDaSessao | undefined;
}

/**
 * Uma partida, do `create` ao `destroy`.
 *
 * Existe fora do React de propósito. O problema difícil do player não é
 * renderizar — é que `create → mount → loadGame → start` é uma sequência
 * assíncrona que pode ser abortada no meio, e o StrictMode aborta no meio
 * **sempre**, logo na primeira montagem. Resolvido dentro de um `useEffect`,
 * isso vira um emaranhado de refs que ninguém consegue testar; resolvido aqui,
 * é um objeto com um sinalizador de descarte e um teste que roda em
 * milissegundos.
 *
 * A regra que a classe honra: **de `iniciar()` até `descartar()`, existe no
 * máximo um adapter, e ele sempre termina destruído** — inclusive quando o
 * descarte acontece antes de o `create` resolver.
 */
export class SessaoDeEmulacao {
  readonly #parametros: ParametrosDaSessao;
  readonly #inscricoes: Unsubscribe[] = [];
  readonly #boot: Promise<void>;

  #adapter: EmulatorAdapter | null = null;
  #descartada = false;
  #relogio: number | null = null;

  private constructor(parametros: ParametrosDaSessao) {
    this.#parametros = parametros;
    this.#boot = this.#abrir();
  }

  static iniciar(parametros: ParametrosDaSessao): SessaoDeEmulacao {
    return new SessaoDeEmulacao(parametros);
  }

  /** Resolve quando o boot terminou — com sucesso ou com falha já notificada. */
  get pronta(): Promise<void> {
    return this.#boot;
  }

  /** `null` até o registry entregar o adapter, e de novo depois do descarte. */
  get adapter(): EmulatorAdapter | null {
    return this.#adapter;
  }

  get descartada(): boolean {
    return this.#descartada;
  }

  /**
   * Encerra a partida. Idempotente e seguro a qualquer momento do boot.
   *
   * Espera o boot terminar antes de destruir: matar um adapter no meio do
   * `mount` deixaria contexto WebGL e AudioContext pendurados — que é
   * exatamente o vazamento que o critério de aceite da issue #18 mede.
   */
  async descartar(): Promise<void> {
    this.#descartada = true;
    this.#pararRelogio();
    await this.#boot.catch(() => undefined);

    for (const cancelar of this.#inscricoes.splice(0)) cancelar();

    const adapter = this.#adapter;
    this.#adapter = null;
    if (adapter !== null) await adapter.destroy();
  }

  async #abrir(): Promise<void> {
    const { registry, systemId, rom, canvas, iniciarAutomaticamente, observador } =
      this.#parametros;

    try {
      const adapter = await registry.create(systemId);
      if (this.#descartada) {
        // O descarte chegou antes do adapter existir: quem destrói é aqui,
        // porque `descartar()` já passou do ponto em que olharia para ele.
        await adapter.destroy();
        return;
      }

      this.#adapter = adapter;
      this.#inscrever(adapter);

      await adapter.mount(canvas);
      if (this.#descartada) return;

      await adapter.loadGame(rom);
      if (this.#descartada) return;

      observador?.aoAbrir?.(adapter);

      if (iniciarAutomaticamente) {
        await adapter.start();
        if (this.#descartada) return;
      }
      this.#ligarRelogio(adapter);
    } catch (erro) {
      if (this.#descartada) return;
      observador?.aoFalhar?.(comoErroDeEmulador(erro));
    }
  }

  #inscrever(adapter: EmulatorAdapter): void {
    const observador = this.#parametros.observador;
    if (observador === undefined) return;

    this.#inscricoes.push(
      adapter.on('statusChange', ({ current }) => observador.aoMudarStatus?.(current)),
      adapter.on('error', ({ error }) => observador.aoFalhar?.(error)),
      adapter.on('fps', ({ fps }) => observador.aoMedirFps?.(fps)),
      adapter.on('sramChange', ({ byteLength }) => observador.aoGravarSram?.(byteLength)),
    );
  }

  /**
   * Faz o tempo passar para adapter que não anda sozinho.
   *
   * O laço acompanha `status` em vez de ser ligado e desligado por comando:
   * pausa vinda do HUD, da aba oculta ou do próprio core param a máquina pelo
   * mesmo caminho, e um laço que só olha o status não tem como discordar dela.
   */
  #ligarRelogio(adapter: EmulatorAdapter): void {
    if (!temRelogioManual(adapter)) return;
    if (typeof requestAnimationFrame !== 'function') return;

    const quadro = (): void => {
      if (this.#descartada || this.#adapter === null) return;
      if (adapter.status === 'running') adapter.advanceFrames(1);
      this.#relogio = requestAnimationFrame(quadro);
    };
    this.#relogio = requestAnimationFrame(quadro);
  }

  #pararRelogio(): void {
    if (this.#relogio === null) return;
    if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(this.#relogio);
    this.#relogio = null;
  }
}

/**
 * Toda falha vira `EmulatorError`.
 *
 * A UI decide o que mostrar a partir do `code`, e um `TypeError` cru vindo de
 * dentro do core não pode obrigar cada tela a ter um segundo caminho de erro.
 */
function comoErroDeEmulador(erro: unknown): EmulatorError {
  if (isEmulatorError(erro)) return erro;
  const causa = erro instanceof Error ? erro.message : String(erro);
  return new EmulatorError('CORE_LOAD_FAILED', `falha inesperada no runtime: ${causa}`, {
    cause: erro,
  });
}
