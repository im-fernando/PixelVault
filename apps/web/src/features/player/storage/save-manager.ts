import {
  isEmulatorError,
  type EmulatorAdapter,
  type Unsubscribe,
} from '@pixelvault/emulator-runtime';
import { describeIncompatibility, assertCompatible } from './compatibility.js';
import {
  SaveCapabilityUnsupportedError,
  SaveIncompatibleError,
  SaveNotFoundError,
  SaveStorageError,
  isSaveStorageError,
} from './errors.js';
import { SAVE_SLOTS, sramKey, stateKey, type SaveSlot } from './save-key.js';
import type { SaveMetadata } from './save-record.js';
import type { SaveStorage, SaveStorageDriver } from './save-storage.js';
import { captureThumbnail, type ThumbnailOptions } from './thumbnail.js';

/**
 * O que a persistência precisa do emulador — nada além disso.
 *
 * É um recorte do `EmulatorAdapter`, e não uma cópia: qualquer adapter serve
 * sem conversão, e uma mudança no contrato do runtime quebra a compilação aqui
 * em vez de silenciosamente divergir. O recorte existe para deixar explícito
 * que o save não liga para `mount`, `start` nem `reset`.
 */
export type SaveCapableEmulator = Pick<
  EmulatorAdapter,
  | 'systemId'
  | 'coreVersion'
  | 'capabilities'
  | 'exportSram'
  | 'importSram'
  | 'exportState'
  | 'importState'
  | 'captureFrame'
  | 'on'
>;

/**
 * Um segundo e meio depois da última escrita do jogo.
 *
 * Curto o bastante para sobreviver a um fechar de aba, longo o bastante para
 * uma rajada de escritas (o jogo salvando o arquivo inteiro byte a byte) virar
 * uma gravação só.
 */
export const SRAM_DEBOUNCE_PADRAO_MS = 1500;

export interface SaveManagerOptions {
  readonly emulator: SaveCapableEmulator;
  readonly storage: SaveStorage;
  /** Identidade estável da ROM — o SHA-256 que a biblioteca já usa. */
  readonly romId: string;
  readonly sramDebounceMs?: number;
  /** `false` desliga a miniatura do save state. */
  readonly thumbnail?: ThumbnailOptions | false;
  /**
   * Onde chegam as falhas do save automático. Ninguém está esperando por essa
   * promessa, então sem isto a falha vira `unhandledrejection` e some.
   */
  readonly onError?: (erro: SaveStorageError) => void;
  /**
   * Dispara depois de cada gravação automática de SRAM bem-sucedida — o
   * gancho que a sincronização com a nuvem (#91) usa para saber quando há
   * algo novo para mandar. Não muda o fluxo existente: a gravação local
   * continua acontecendo do mesmo jeito, isto só avisa quem quiser ouvir.
   */
  readonly onSramWritten?: (metadata: SaveMetadata) => void;
  /** Relógio, injetável para teste. */
  readonly now?: () => number;
}

/** Um slot como a galeria precisa ver: cheio, vazio ou cheio e inservível. */
export interface SaveSlotView {
  readonly slot: SaveSlot;
  /** `null` quando o slot está vazio. */
  readonly metadata: SaveMetadata | null;
  /** `null` em slot vazio e em state gravado sem miniatura. Use `thumbnailUrl`. */
  readonly thumbnail: Blob | null;
  /** `null` quando dá para carregar; a frase pronta para a UI quando não dá. */
  readonly incompatibleReason: string | null;
}

/**
 * Liga o emulador ao storage. É a peça que o player usa.
 *
 * O player não conhece OPFS, não monta chave de save e não decide se um state
 * pode ser carregado: ele chama método daqui. Trocar o storage local pelo
 * sincronizado da M4 é construir este mesmo objeto com outra implementação da
 * porta — nenhuma linha do player muda.
 *
 * SRAM e save state andam por caminhos separados de ponta a ponta, porque são
 * coisas diferentes: a SRAM é gravada sozinha pelo jogo e restaurada sozinha ao
 * abrir; o save state é sempre ação explícita de quem está jogando.
 */
export class SaveManager {
  readonly romId: string;

  readonly #emulador: SaveCapableEmulator;
  readonly #storage: SaveStorage;
  readonly #debounceMs: number;
  readonly #thumbnail: ThumbnailOptions | false;
  readonly #onError: (erro: SaveStorageError) => void;
  readonly #onSramWritten: ((metadata: SaveMetadata) => void) | undefined;
  readonly #agora: () => number;

  #cancelarInscricao: Unsubscribe | null = null;
  #temporizador: ReturnType<typeof setTimeout> | null = null;
  #sramPendente = false;
  #ultimaSramGravada: Uint8Array | null = null;
  #fila: Promise<unknown> = Promise.resolve();
  #descartado = false;

  constructor(options: SaveManagerOptions) {
    this.romId = options.romId;
    this.#emulador = options.emulator;
    this.#storage = options.storage;
    this.#debounceMs = options.sramDebounceMs ?? SRAM_DEBOUNCE_PADRAO_MS;
    this.#thumbnail = options.thumbnail ?? {};
    this.#onSramWritten = options.onSramWritten;
    this.#agora = options.now ?? Date.now;
    this.#onError =
      options.onError ??
      ((erro) => {
        console.error('[player/storage] falha ao salvar automaticamente', erro);
      });
  }

  get driver(): SaveStorageDriver {
    return this.#storage.driver;
  }

  /** `true` quando nada do que for salvo sobrevive ao fechar da aba. */
  get isVolatile(): boolean {
    return this.#storage.driver === 'memory';
  }

  // --------------------------------------------------------------- SRAM

  /**
   * Liga o save automático da bateria do cartucho.
   *
   * O gatilho é o evento do adapter, não um relógio: `sramChange` é o jogo
   * dizendo que gravou. Salvar por tempo perde a partida de quem salvou e
   * fechou a aba em seguida, e grava à toa o resto do tempo.
   */
  watchSram(): Unsubscribe {
    if (this.#cancelarInscricao !== null) {
      return this.#cancelarInscricao;
    }
    const cancelar = this.#emulador.on('sramChange', () => {
      this.#agendarGravacaoDeSram();
    });
    this.#cancelarInscricao = () => {
      cancelar();
      this.#cancelarInscricao = null;
    };
    return this.#cancelarInscricao;
  }

  /**
   * Devolve ao cartucho a bateria guardada. Chamar ao abrir o jogo.
   *
   * `null` quando não há save — jogo novo, e não erro.
   *
   * A validação aqui é mais frouxa que a do save state de propósito: SRAM é do
   * jogo, não do emulador, e atravessa troca de versão de core sem problema.
   * Só o console precisa bater. Ver `compatibility.ts`.
   */
  async restoreSram(): Promise<SaveMetadata | null> {
    this.#exigirCapacidade('sram');
    const guardado = await this.#storage.read(sramKey(this.romId));
    if (guardado === null) {
      return null;
    }
    assertCompatible(guardado.metadata, this.#identidade());
    await this.#emulador.importSram(guardado.data);
    // O que acabou de entrar não precisa ser regravado, e `importSram` emite
    // `sramChange`; sem isto, abrir o jogo já dispararia uma gravação inútil.
    this.#ultimaSramGravada = guardado.data.slice();
    this.#sramPendente = false;
    this.#cancelarTemporizador();
    return guardado.metadata;
  }

  /**
   * Grava a SRAM agora, sem esperar o debounce.
   *
   * `null` quando não havia nada para gravar. É o que o player chama no
   * `beforeunload` e ao desmontar.
   */
  async flushSram(): Promise<SaveMetadata | null> {
    this.#cancelarTemporizador();
    return this.#enfileirar(() => this.#gravarSram());
  }

  // -------------------------------------------------------- Save states

  /**
   * Fotografa a máquina no slot pedido, com miniatura do quadro atual.
   *
   * A miniatura sai da mesma operação porque é a única hora em que ela é
   * verdade: gerar depois mostraria um quadro que não é o do save. Falhar a
   * miniatura não falha o save — o state entra sem imagem e a galeria mostra
   * o placeholder.
   */
  async saveState(slot: SaveSlot): Promise<SaveMetadata> {
    return this.#enfileirar(async () => {
      this.#exigirCapacidade('saveState');
      const data = await this.#emulador.exportState();
      const thumbnail =
        this.#thumbnail === false ? null : await captureThumbnail(this.#emulador, this.#thumbnail);
      const key = stateKey(this.romId, slot);
      const anterior = await this.#storage.read(key);
      return this.#storage.write({
        key,
        data,
        thumbnail,
        systemId: this.#emulador.systemId,
        coreVersion: this.#emulador.coreVersion,
        // Duas gravações no mesmo milissegundo ainda precisam ser versões distintas.
        updatedAt: Math.max(this.#agora(), (anterior?.metadata.updatedAt ?? -1) + 1),
      });
    });
  }

  /**
   * Devolve a máquina ao ponto gravado no slot.
   *
   * Recusa **antes** de tocar no emulador quando o state é de outro console ou
   * de outra versão de core. Essa checagem é a razão de os metadados existirem:
   * importar um state incompatível não dá erro na hora, dá partida corrompida
   * meia hora depois, com sintoma que ninguém liga ao save.
   */
  async loadState(slot: SaveSlot): Promise<SaveMetadata> {
    this.#exigirCapacidade('saveState');
    const chave = stateKey(this.romId, slot);
    const guardado = await this.#storage.read(chave);
    if (guardado === null) {
      throw new SaveNotFoundError(chave);
    }
    assertCompatible(guardado.metadata, this.#identidade());

    try {
      await this.#emulador.importState(guardado.data);
    } catch (erro) {
      // Segunda linha de defesa: o core valida o que os metadados não sabem
      // (outra ROM, formato interno). Traduzido para a mesma família de erro,
      // senão a UI precisaria conhecer dois vocabulários para dizer a mesma coisa.
      if (isEmulatorError(erro) && erro.code === 'STATE_INCOMPATIBLE') {
        throw new SaveIncompatibleError(erro.message, { cause: erro });
      }
      throw erro;
    }
    // O state carregado traz a SRAM dele; o `sramChange` que o core emite vai
    // agendar a gravação, e é isso que mantém a bateria coerente com o state.
    return guardado.metadata;
  }

  async deleteState(slot: SaveSlot): Promise<void> {
    await this.#storage.remove(stateKey(this.romId, slot));
  }

  /**
   * Os quatro slots, na ordem, cheios ou vazios.
   *
   * Sempre quatro: a galeria desenha slot vazio, e uma lista só com o que
   * existe obrigaria a UI a remontar os buracos.
   */
  async listStates(): Promise<readonly SaveSlotView[]> {
    const guardados = await this.#storage.list(this.romId);
    const porSlot = new Map<SaveSlot, SaveMetadata>();
    for (const metadata of guardados) {
      if (metadata.kind === 'state' && metadata.slot !== undefined) {
        porSlot.set(metadata.slot, metadata);
      }
    }

    const identidade = this.#identidade();
    return Promise.all(
      SAVE_SLOTS.map(async (slot): Promise<SaveSlotView> => {
        const metadata = porSlot.get(slot) ?? null;
        if (metadata === null) {
          return { slot, metadata: null, thumbnail: null, incompatibleReason: null };
        }
        const thumbnail = metadata.hasThumbnail
          ? await this.#storage.readThumbnail(stateKey(this.romId, slot))
          : null;
        return {
          slot,
          metadata,
          thumbnail,
          incompatibleReason: describeIncompatibility(metadata, identidade),
        };
      }),
    );
  }

  // ------------------------------------------------------------- Ciclo

  /**
   * Desliga o save automático e grava o que ficou pendente.
   *
   * Grava de propósito: o caso mais comum de desmontar é sair do jogo, e o
   * debounce em voo é exatamente o progresso dos últimos segundos.
   */
  async dispose(): Promise<void> {
    if (this.#descartado) {
      return;
    }
    this.#descartado = true;
    this.#cancelarInscricao?.();
    this.#cancelarTemporizador();
    try {
      await this.#enfileirar(() => this.#gravarSram());
    } catch (erro) {
      this.#relatar(erro);
    }
  }

  // ---------------------------------------------------------- Internos

  #agendarGravacaoDeSram(): void {
    if (this.#descartado) {
      return;
    }
    this.#sramPendente = true;
    this.#cancelarTemporizador();
    this.#temporizador = setTimeout(() => {
      this.#temporizador = null;
      void this.#enfileirar(() => this.#gravarSram()).catch((erro: unknown) => {
        this.#relatar(erro);
      });
    }, this.#debounceMs);
  }

  async #gravarSram(): Promise<SaveMetadata | null> {
    if (!this.#sramPendente || !this.#emulador.capabilities.sram) {
      return null;
    }
    const data = await this.#emulador.exportSram();
    this.#sramPendente = false;

    // Cartucho sem bateria devolve zero byte. Gravar isso por cima de um save
    // bom é a forma mais rápida de apagar a partida de alguém.
    if (data.byteLength === 0) {
      return null;
    }
    if (this.#ultimaSramGravada !== null && mesmosBytes(this.#ultimaSramGravada, data)) {
      return null;
    }

    const metadata = await this.#storage.write({
      key: sramKey(this.romId),
      data,
      systemId: this.#emulador.systemId,
      coreVersion: this.#emulador.coreVersion,
      updatedAt: this.#agora(),
    });
    this.#ultimaSramGravada = data.slice();
    this.#onSramWritten?.(metadata);
    return metadata;
  }

  #enfileirar<T>(tarefa: () => Promise<T>): Promise<T> {
    // Gravações em série: duas exportações concorrentes de SRAM podem terminar
    // fora de ordem e deixar a mais velha por cima da mais nova.
    const proxima = this.#fila.then(tarefa, tarefa);
    this.#fila = proxima.catch(() => undefined);
    return proxima;
  }

  #cancelarTemporizador(): void {
    if (this.#temporizador !== null) {
      clearTimeout(this.#temporizador);
      this.#temporizador = null;
    }
  }

  #exigirCapacidade(capacidade: 'sram' | 'saveState'): void {
    if (!this.#emulador.capabilities[capacidade]) {
      throw new SaveCapabilityUnsupportedError(capacidade);
    }
  }

  #identidade(): { systemId: EmulatorAdapter['systemId']; coreVersion: string } {
    return { systemId: this.#emulador.systemId, coreVersion: this.#emulador.coreVersion };
  }

  #relatar(erro: unknown): void {
    this.#onError(
      isSaveStorageError(erro)
        ? erro
        : new SaveStorageError('IO_FAILED', 'falha inesperada ao salvar', { cause: erro }),
    );
  }
}

function mesmosBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i += 1) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
