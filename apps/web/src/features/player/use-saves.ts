import { useCallback, useEffect, useRef, useState } from 'react';
import type { EmulatorAdapter, EmulatorStatus } from '@pixelvault/emulator-runtime';
import {
  SAVE_SLOTS,
  createSaveManager,
  isSaveStorageError,
  type SaveManager,
  type SaveMetadata,
  type SaveSlot,
  type SaveSlotView,
  type SaveStorageDriver,
} from './storage/index.js';

/**
 * Liga o gerenciador de save local ao adapter em uso.
 *
 * O ciclo de vida é o do adapter, não o do componente: cada partida abre um
 * gerenciador e o descarta gravando o que estiver pendente. `dispose()` é
 * obrigatório — sem ele, o último trecho de SRAM em debounce vai embora
 * exatamente quando a pessoa fecha a aba achando que salvou.
 */

const COM_ROM: readonly EmulatorStatus[] = ['ready', 'running', 'paused'];

export interface Saves {
  readonly pronto: boolean;
  readonly driver: SaveStorageDriver | null;
  /** Nada aqui sobrevive a fechar a aba. Aba anônima sem OPFS nem IndexedDB. */
  readonly volatil: boolean;
  readonly slots: readonly SaveSlotView[];
  readonly ultimaSram: number | null;
  salvar(slot: SaveSlot): Promise<string>;
  carregar(slot: SaveSlot): Promise<string>;
  apagar(slot: SaveSlot): Promise<string>;
  /**
   * Relê os 4 slots do storage local — issue #108. Uma gravação feita por
   * fora do `SaveManager` (baixar um save state da nuvem, ou aplicar a
   * escolha "manter a nuvem" de um conflito) não passa por `comGerente`, e
   * sem isto a galeria continuaria mostrando o slot como estava antes do
   * download até a próxima ação local.
   */
  recarregar(): Promise<void>;
  /** Conclui a escrita pendente da bateria antes de sair da partida. */
  prepararSaida(): Promise<boolean>;
}

const SLOTS_VAZIOS: readonly SaveSlotView[] = SAVE_SLOTS.map((slot) => ({
  slot,
  metadata: null,
  thumbnail: null,
  incompatibleReason: null,
}));

export function useSaves(
  adapter: EmulatorAdapter | null,
  romId: string | null,
  onSramWritten?: (metadata: SaveMetadata) => void,
): Saves {
  const gerenteRef = useRef<SaveManager | null>(null);
  // Ref, não dependência do efeito: um `onSramWritten` recriado a cada
  // render (comum em callback inline) não pode reabrir o `SaveManager` —
  // fechar e abrir o storage por causa de uma closure nova perderia o
  // debounce de SRAM em voo.
  const onSramWrittenRef = useRef(onSramWritten);
  onSramWrittenRef.current = onSramWritten;
  const [pronto, setPronto] = useState(false);
  const [driver, setDriver] = useState<SaveStorageDriver | null>(null);
  const [volatil, setVolatil] = useState(false);
  const [slots, setSlots] = useState<readonly SaveSlotView[]>(SLOTS_VAZIOS);
  const [ultimaSram, setUltimaSram] = useState<number | null>(null);

  const recarregar = useCallback(async (): Promise<void> => {
    const gerente = gerenteRef.current;
    if (gerente === null) return;
    setSlots(await gerente.listStates());
  }, []);

  useEffect(() => {
    if (adapter === null || romId === null || !COM_ROM.includes(adapter.status)) return;

    let cancelado = false;
    let pararSram: (() => void) | undefined;

    const abrir = async (): Promise<void> => {
      const gerente = await createSaveManager({
        emulator: adapter,
        romId,
        onError: () => setUltimaSram(null),
        onSramWritten: (metadata) => onSramWrittenRef.current?.(metadata),
      });
      if (cancelado) {
        await gerente.dispose();
        return;
      }

      gerenteRef.current = gerente;
      setDriver(gerente.driver);
      setVolatil(gerente.isVolatile);

      // A ordem importa: restaurar a bateria ANTES de observar, senão o
      // próprio `importSram` dispara uma gravação do que acabou de ser lido.
      await gerente.restoreSram().catch(() => null);
      pararSram = gerente.watchSram();

      setSlots(await gerente.listStates());
      setPronto(true);
    };

    void abrir();

    return () => {
      cancelado = true;
      pararSram?.();
      const gerente = gerenteRef.current;
      gerenteRef.current = null;
      setPronto(false);
      setSlots(SLOTS_VAZIOS);
      void gerente?.dispose();
    };
  }, [adapter, romId]);

  const comGerente = useCallback(
    async (acao: (gerente: SaveManager) => Promise<string>): Promise<string> => {
      const gerente = gerenteRef.current;
      if (gerente === null) return 'O armazenamento local ainda não abriu.';
      try {
        const recado = await acao(gerente);
        await recarregar();
        return recado;
      } catch (erro) {
        return isSaveStorageError(erro) ? erro.message : 'Falha ao falar com o armazenamento.';
      }
    },
    [recarregar],
  );

  const salvar = useCallback(
    (slot: SaveSlot) =>
      comGerente(async (gerente) => {
        await gerente.saveState(slot);
        setUltimaSram(Date.now());
        return `Estado salvo no slot ${slot + 1}.`;
      }),
    [comGerente],
  );

  const carregar = useCallback(
    (slot: SaveSlot) =>
      comGerente(async (gerente) => {
        await gerente.loadState(slot);
        return `Estado do slot ${slot + 1} restaurado.`;
      }),
    [comGerente],
  );

  const apagar = useCallback(
    (slot: SaveSlot) =>
      comGerente(async (gerente) => {
        await gerente.deleteState(slot);
        return `Slot ${slot + 1} apagado.`;
      }),
    [comGerente],
  );

  const prepararSaida = useCallback(async () => {
    try {
      await gerenteRef.current?.flushSram();
      return true;
    } catch {
      return false;
    }
  }, []);

  return {
    pronto,
    driver,
    volatil,
    slots,
    ultimaSram,
    salvar,
    carregar,
    apagar,
    recarregar,
    prepararSaida,
  };
}
