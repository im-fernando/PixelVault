import { useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ApiRequestError } from '../../lib/api.js';
import { CHAVE_DAS_CONQUISTAS } from '../achievements/use-conquistas.js';
import type { StateSlotResumo, SystemId } from '@pixelvault/contracts';
import type { LadoLocalDoConflito, LadoNuvemDoConflito } from './ResolucaoDeConflitoDeSaveState.js';
import {
  base64ParaBlob,
  baixarBytesDoSaveState,
  bytesParaBase64,
  enviarSaveState,
  useSaveStatesNaNuvem,
  chaveDosSaveStatesNaNuvem,
  miniaturaParaEnvio,
} from './state-nuvem.js';
import {
  createSaveStorage,
  stateKey,
  type SaveSlot,
  type SaveSlotView,
  type SaveStorage,
} from './storage/index.js';
import { gravarPointerDeSaveState, lerPointerDeSaveState } from './storage/state-sync-pointer.js';

export type EstadoDoSlotNaNuvem = 'apenas-local' | 'apenas-nuvem' | 'sincronizado' | 'divergente';

export interface SincronizacaoDeSaveStates {
  /** Sem entrada para um slot: nada em nenhum lado, não há o que mostrar. */
  readonly estadoPorSlot: ReadonlyMap<SaveSlot, EstadoDoSlotNaNuvem>;
  /** O slot com uma operação em voo — sobe, baixa, ou lê bytes para abrir o conflito. */
  readonly ocupado: SaveSlot | null;
  readonly conflito: {
    readonly slot: SaveSlot;
    readonly local: LadoLocalDoConflito;
    readonly nuvem: LadoNuvemDoConflito;
  } | null;
  readonly erro: string | null;
  /**
   * A ação certa para o estado atual do slot: envia (apenas-local), baixa
   * (apenas-nuvem), ou abre a tela de conflito da #107 (divergente).
   * Sincronizado e "nada em nenhum lado" não fazem nada — não há ação a
   * oferecer.
   */
  aoClicarSincronizar(slot: SaveSlot): void;
  fecharConflito(): void;
  /** Chamado como `aoResolver` de `ResolucaoDeConflitoDeSaveState`. */
  aoResolverConflito(escolha: 'nuvem' | 'local'): void;
}

/**
 * Cada gravação local dispara o envio, sem debounce ou clique adicional.
 * O storage local conserva pendências entre partidas; reconexão e novas
 * tentativas retomam os envios. Revisões divergentes exigem escolha explícita.
 * O SHA-256 identifica o save local; o UUID da biblioteca identifica a API
 * e o ponteiro da conta. Nunca enviar o hash numa rota que exige UUID.
 */
export function useSincronizacaoDeSaveStates(
  romId: string | null,
  slotsLocais: readonly SaveSlotView[],
  systemId: SystemId,
  coreVersion: string | null,
  recarregarLocal: () => Promise<void>,
  storageInjetado?: SaveStorage,
  romIdNaNuvem: string | null = romId,
): SincronizacaoDeSaveStates {
  const nuvem = useSaveStatesNaNuvem(romIdNaNuvem);
  const queryClient = useQueryClient();
  const emOperacao = useRef(false);
  const tentativas = useRef(new Map<SaveSlot, number>());
  const [, setRodada] = useState(0);
  const retentarRef = useRef(() => {});
  useEffect(() => {
    if (romIdNaNuvem === null) return;
    const retentar = () => retentarRef.current();
    const timer = window.setInterval(retentar, 15_000);
    window.addEventListener('online', retentar);
    window.addEventListener('focus', retentar);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', retentar);
      window.removeEventListener('focus', retentar);
    };
  }, [romIdNaNuvem]);
  const [ocupado, setOcupado] = useState<SaveSlot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [conflito, setConflito] = useState<SincronizacaoDeSaveStates['conflito']>(null);
  const storageRef = useRef<SaveStorage | null>(storageInjetado ?? null);

  const abrirStorage = async (): Promise<SaveStorage> => {
    if (storageInjetado !== undefined) return storageInjetado;
    storageRef.current ??= await createSaveStorage();
    return storageRef.current;
  };

  const resumoDaNuvem = (slot: SaveSlot): StateSlotResumo | undefined =>
    nuvem.data?.slots.find((resumo) => resumo.slot === slot);

  const estadoPorSlot = useMemo<ReadonlyMap<SaveSlot, EstadoDoSlotNaNuvem>>(() => {
    const mapa = new Map<SaveSlot, EstadoDoSlotNaNuvem>();
    if (romId === null || romIdNaNuvem === null) return mapa;
    if (nuvem.data === undefined) {
      for (const vista of slotsLocais)
        if (vista.metadata !== null) mapa.set(vista.slot, 'apenas-local');
      return mapa;
    }

    for (const vista of slotsLocais) {
      const metadataLocal = vista.metadata;
      const remoto = resumoDaNuvem(vista.slot);

      if (metadataLocal === null && remoto === undefined) continue; // nada em nenhum lado
      if (metadataLocal !== null && remoto === undefined) {
        mapa.set(vista.slot, 'apenas-local');
        continue;
      }
      if (metadataLocal === null && remoto !== undefined) {
        mapa.set(vista.slot, 'apenas-nuvem');
        continue;
      }
      // Os dois têm conteúdo (`metadataLocal !== null && remoto !== undefined`
      // pelas duas checagens acima) — o ponteiro deste aparelho decide entre
      // rotina, "só o local mudou" e colisão de verdade. Ver o cabeçalho da
      // função para as três leituras.
      const pointer = lerPointerDeSaveState(romIdNaNuvem, vista.slot);
      if (pointer === null || pointer.revision !== remoto!.revision) {
        mapa.set(vista.slot, 'divergente');
      } else if (pointer.updatedAtLocal !== metadataLocal!.updatedAt) {
        mapa.set(vista.slot, 'apenas-local');
      } else {
        mapa.set(vista.slot, 'sincronizado');
      }
    }
    return mapa;
  }, [romId, romIdNaNuvem, slotsLocais, nuvem.data]);

  retentarRef.current = () => {
    if (emOperacao.current) return;
    if (!nuvem.error && erro === null && ![...estadoPorSlot.values()].includes('apenas-local'))
      return;
    tentativas.current.clear();
    setRodada((valor) => valor + 1);
    void nuvem.refetch();
  };

  const enviar = async (slot: SaveSlot): Promise<void> => {
    if (emOperacao.current || romId === null || romIdNaNuvem === null) return;
    emOperacao.current = true;
    setErro(null);
    setOcupado(slot);
    try {
      await queryClient.cancelQueries({ queryKey: chaveDosSaveStatesNaNuvem(romIdNaNuvem!) });
      const storage = await abrirStorage();
      const guardado = await storage.read(stateKey(romId!, slot));
      if (guardado === null) return; // mudou de estado entre o clique e a leitura — não é erro
      const thumbnailBase64 = await miniaturaParaEnvio(guardado.thumbnail);
      // A revisão de base é a que a nuvem tinha quando este hook classificou
      // o slot como "apenas-local" — `0` se nunca existiu save neste slot,
      // ou a revisão que o pointer conhecia se a nuvem não mudou desde
      // então (é exatamente o caso que torna isto "apenas-local" e não
      // "divergente": só o local andou).
      const pointerAtual = lerPointerDeSaveState(romIdNaNuvem!, slot);
      const resposta = await enviarSaveState(
        romIdNaNuvem,
        slot,
        {
          dataBase64: bytesParaBase64(guardado.data),
          thumbnailBase64,
          revision: resumoDaNuvem(slot) === undefined ? 0 : (pointerAtual?.revision ?? 0),
        },
        guardado.metadata.updatedAt,
      );
      // Atualiza a revisão confirmada antes de liberar o próximo envio.
      // Uma listagem antiga não pode transformar nossa própria gravação em conflito.
      await queryClient.cancelQueries({ queryKey: chaveDosSaveStatesNaNuvem(romIdNaNuvem) });
      queryClient.setQueryData(chaveDosSaveStatesNaNuvem(romIdNaNuvem), {
        slots: [
          ...(nuvem.data?.slots.filter((resumo) => resumo.slot !== slot) ?? []),
          {
            slot,
            revision: resposta.revision,
            sizeBytes: resposta.sizeBytes,
            updatedAt: resposta.updatedAt,
            thumbnailBase64,
          },
        ],
      });
      void queryClient.invalidateQueries({ queryKey: CHAVE_DAS_CONQUISTAS });
    } catch (falha) {
      if (falha instanceof ApiRequestError && falha.status === 409) {
        setErro(
          falha.payload.details?.['cota']
            ? falha.payload.message
            : 'Este slot mudou na nuvem. Compare as versões para concluir a sincronização.',
        );
        void nuvem.refetch();
      } else {
        setErro(
          'Save preservado neste aparelho. Não foi possível enviar à nuvem; tentaremos novamente automaticamente.',
        );
      }
    } finally {
      emOperacao.current = false;
      setOcupado(null);
    }
  };

  // Uma operação por vez; slots alterados durante um upload entram na próxima
  // renderização. Falhas não geram um loop: repetimos ao reconectar ou em 15s.
  useEffect(() => {
    if (
      emOperacao.current ||
      conflito !== null ||
      romIdNaNuvem === null ||
      nuvem.data === undefined ||
      nuvem.isFetching
    )
      return;
    for (const vista of slotsLocais) {
      if (vista.metadata === null || estadoPorSlot.get(vista.slot) !== 'apenas-local') continue;
      if (tentativas.current.get(vista.slot) === vista.metadata.updatedAt) continue;
      tentativas.current.set(vista.slot, vista.metadata.updatedAt);
      void enviar(vista.slot);
      break;
    }
  });
  // A rodada força a inspeção mesmo quando a listagem não mudou (offline).

  const baixar = async (slot: SaveSlot): Promise<void> => {
    setErro(null);
    // Sem `coreVersion` (core ainda não montou) não há como carimbar de qual
    // build o save baixado é — a mesma checagem de compatibilidade que
    // recusa carregar um state de core errado (`compatibility.ts`) recusaria
    // este logo depois, então nem grava.
    if (coreVersion === null) {
      setErro('O núcleo ainda não carregou — espere e tente de novo.');
      return;
    }
    emOperacao.current = true;
    setOcupado(slot);
    try {
      const resumo = resumoDaNuvem(slot);
      if (resumo === undefined) return; // mudou de estado entretanto
      const bytes = await baixarBytesDoSaveState(romIdNaNuvem!, slot);
      if (bytes === null) return;
      const storage = await abrirStorage();
      await storage.write({
        key: stateKey(romId!, slot),
        data: bytes,
        systemId,
        coreVersion,
        updatedAt: Date.parse(resumo.updatedAt),
        thumbnail: base64ParaBlob(resumo.thumbnailBase64),
      });
      gravarPointerDeSaveState(romIdNaNuvem!, slot, resumo.revision, Date.parse(resumo.updatedAt));
      await recarregarLocal();
    } catch {
      setErro('Falha ao baixar o save state. Tente de novo.');
    } finally {
      emOperacao.current = false;
      setOcupado(null);
    }
  };

  const abrirConflito = async (slot: SaveSlot): Promise<void> => {
    emOperacao.current = true;
    setOcupado(slot);
    setErro(null);
    try {
      const resumo = resumoDaNuvem(slot);
      const vista = slotsLocais.find((s) => s.slot === slot);
      if (resumo === undefined || vista?.metadata === null || vista === undefined) return;
      const storage = await abrirStorage();
      const guardado = await storage.read(stateKey(romId!, slot));
      if (guardado === null) return;
      setConflito({
        slot,
        local: { metadata: vista.metadata, thumbnail: vista.thumbnail, data: guardado.data },
        nuvem: {
          revision: resumo.revision,
          sizeBytes: resumo.sizeBytes,
          updatedAt: resumo.updatedAt,
          thumbnailBase64: resumo.thumbnailBase64,
        },
      });
    } catch {
      setErro('Falha ao preparar a comparação. Tente de novo.');
    } finally {
      emOperacao.current = false;
      setOcupado(null);
    }
  };

  return {
    estadoPorSlot,
    ocupado,
    conflito,
    erro:
      erro ??
      (nuvem.error
        ? 'Não foi possível consultar os saves na nuvem. O progresso continua neste aparelho; tentaremos novamente automaticamente.'
        : null),
    aoClicarSincronizar(slot) {
      if (emOperacao.current || ocupado !== null || conflito !== null) return;
      if (nuvem.data === undefined) {
        retentarRef.current();
        return;
      }
      const estado = estadoPorSlot.get(slot);
      if (estado === 'apenas-local') void enviar(slot);
      else if (estado === 'apenas-nuvem') void baixar(slot);
      else if (estado === 'divergente') void abrirConflito(slot);
      // 'sincronizado' e ausente: nada a fazer.
    },
    fecharConflito() {
      setConflito(null);
    },
    aoResolverConflito(escolha) {
      if (conflito === null) return;
      if (escolha === 'nuvem') {
        // `ResolucaoDeConflitoDeSaveState` já escreveu os bytes/miniatura da
        // nuvem no storage local — falta só marcar ESTE aparelho como
        // reconciliado com essa revisão (a escrita local não passa por
        // `enviarSaveState`, que é quem grava o ponteiro do lado de envio) e
        // reler a galeria local, que não sabe da gravação por fora do
        // `SaveManager`.
        gravarPointerDeSaveState(
          romIdNaNuvem!,
          conflito.slot,
          conflito.nuvem.revision,
          Date.parse(conflito.nuvem.updatedAt),
        );
        void recarregarLocal();
      }
      // 'local': o upload que `ResolucaoDeConflitoDeSaveState` disparou já
      // passou por `useEnviarSaveStateParaNuvem`, que grava o ponteiro no
      // próprio `onSuccess` (ver `state-nuvem.ts`).
      setConflito(null);
      void nuvem.refetch();
    },
  };
}
