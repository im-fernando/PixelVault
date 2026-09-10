import { useMemo, useRef, useState } from 'react';
import type { StateSlotResumo, SystemId } from '@pixelvault/contracts';
import type { LadoLocalDoConflito, LadoNuvemDoConflito } from './ResolucaoDeConflitoDeSaveState.js';
import {
  base64ParaBlob,
  baixarBytesDoSaveState,
  blobParaBase64,
  bytesParaBase64,
  enviarSaveState,
  useSaveStatesNaNuvem,
} from './state-nuvem.js';
import {
  createSaveStorage,
  stateKey,
  type SaveSlot,
  type SaveSlotView,
  type SaveStorage,
} from './storage/index.js';
import {
  gravarRevisaoDeSaveStateSincronizada,
  lerRevisaoDeSaveStateSincronizada,
} from './storage/state-sync-pointer.js';

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
 * Liga a galeria de slots (local) à nuvem — issue #108, a peça final da M5.
 *
 * ## Clique explícito, não sincronização automática (decisão desta issue)
 *
 * A #105 decidiu que o upload de save state é sempre uma chamada explícita à
 * rota, e adiou para aqui a pergunta de front: subir depois de salvar
 * localmente é automático (como a SRAM, #91) ou um clique à parte? Esta
 * issue escolhe **clique explícito**, por slot: save state nasce de uma
 * decisão deliberada ("salvar aqui, agora, antes do chefe"), e automatizar o
 * envio mudaria a natureza da ação sem a pessoa pedir. SRAM regrava sozinha
 * o tempo todo e uma cópia velha na nuvem não dói — save state é exatamente
 * o tipo de dado em que "subiu escondido algo que eu não queria substituir"
 * dói mais do que a espera de um clique.
 *
 * ## Vínculo por slot, não por ROM inteira
 *
 * A SRAM tem um vínculo só por `romId` (#92: "existe algo na nuvem" já basta,
 * porque só há uma SRAM). Save state tem 4 slots independentes — sincronizar
 * o A não pode fazer o B parecer sincronizado. O ponteiro de
 * `storage/state-sync-pointer.ts` é por `romId` **e** `slot`, e é ele que
 * decide `sincronizado` vs. `divergente` quando os dois lados têm conteúdo:
 * pointer bate com a revisão da nuvem → rotina; não bate (inclusive nunca
 * sincronizado, pointer `0`) → colisão, abre a tela da #107. Nunca resolve
 * uma divergência por conta própria.
 *
 * ## Por que não lê o storage local sozinho
 *
 * Quem já sabe o estado local de cada slot é `useSaves` (`EmulatorPlayer`),
 * que já mantém isso em memória com miniatura incluída. Duplicar a leitura
 * aqui seria uma segunda fonte da mesma verdade; em vez disso, este hook
 * recebe `slotsLocais` de fora e só abre um `SaveStorage` próprio (ver
 * `abrirStorage`) quando precisa GRAVAR (baixar da nuvem) ou LER OS BYTES
 * CRUS de um slot (enviar, ou montar o lado local de um conflito) — coisas
 * que `SaveSlotView` não carrega, de propósito (é metadado + miniatura, não
 * o estado inteiro).
 */
export function useSincronizacaoDeSaveStates(
  romId: string | null,
  slotsLocais: readonly SaveSlotView[],
  systemId: SystemId,
  coreVersion: string | null,
  recarregarLocal: () => Promise<void>,
  storageInjetado?: SaveStorage,
): SincronizacaoDeSaveStates {
  const nuvem = useSaveStatesNaNuvem(romId);
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
    if (romId === null || nuvem.data === undefined) return mapa;

    for (const vista of slotsLocais) {
      const local = vista.metadata !== null;
      const remoto = resumoDaNuvem(vista.slot);

      if (!local && remoto === undefined) continue; // nada em nenhum lado
      if (local && remoto === undefined) {
        mapa.set(vista.slot, 'apenas-local');
        continue;
      }
      if (!local && remoto !== undefined) {
        mapa.set(vista.slot, 'apenas-nuvem');
        continue;
      }
      // Os dois têm conteúdo: o ponteiro deste aparelho decide se é rotina.
      const pointer = lerRevisaoDeSaveStateSincronizada(romId, vista.slot);
      mapa.set(
        vista.slot,
        pointer !== 0 && pointer === remoto?.revision ? 'sincronizado' : 'divergente',
      );
    }
    return mapa;
  }, [romId, slotsLocais, nuvem.data]);

  const enviar = async (slot: SaveSlot): Promise<void> => {
    setErro(null);
    setOcupado(slot);
    try {
      const storage = await abrirStorage();
      const guardado = await storage.read(stateKey(romId!, slot));
      if (guardado === null) return; // mudou de estado entre o clique e a leitura — não é erro
      const miniatura = await storage.readThumbnail(stateKey(romId!, slot));
      if (miniatura === null) {
        setErro('Este slot não tem miniatura — não é possível enviar para a nuvem.');
        return;
      }
      await enviarSaveState(romId!, slot, {
        dataBase64: bytesParaBase64(guardado.data),
        thumbnailBase64: await blobParaBase64(miniatura),
        revision: 0,
      });
      void nuvem.refetch();
    } catch {
      setErro('Falha ao enviar o save state. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  };

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
    setOcupado(slot);
    try {
      const resumo = resumoDaNuvem(slot);
      if (resumo === undefined) return; // mudou de estado entretanto
      const bytes = await baixarBytesDoSaveState(romId!, slot);
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
      gravarRevisaoDeSaveStateSincronizada(romId!, slot, resumo.revision);
      await recarregarLocal();
    } catch {
      setErro('Falha ao baixar o save state. Tente de novo.');
    } finally {
      setOcupado(null);
    }
  };

  const abrirConflito = async (slot: SaveSlot): Promise<void> => {
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
    }
  };

  return {
    estadoPorSlot,
    ocupado,
    conflito,
    erro,
    aoClicarSincronizar(slot) {
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
        gravarRevisaoDeSaveStateSincronizada(romId!, conflito.slot, conflito.nuvem.revision);
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
