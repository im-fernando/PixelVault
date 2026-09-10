import { useEffect, useState } from 'react';
import { createSaveStorage } from './create-save-storage.js';
import { sramKey } from './save-key.js';
import type { StoredSave } from './save-record.js';
import type { SaveStorage } from './save-storage.js';

/**
 * A SRAM local de uma ROM, lida fora de uma partida em andamento.
 *
 * A #92 precisa disto para oferecer a adoção na tela do jogo, antes mesmo de
 * apertar "jogar" — `useSaves` só abre o storage quando o `EmulatorAdapter`
 * já existe (ver `EmulatorPlayer`), e a oferta de adoção não pode esperar
 * isso. `createSaveStorage()` abre um segundo handle independente: OPFS e
 * IndexedDB aceitam múltiplas aberturas concorrentes, então isto não disputa
 * nada com o storage que a partida ativa usa.
 */
export interface EstadoDoSramLocal {
  readonly pending: boolean;
  /** `null` enquanto carrega, ou quando não existe SRAM local para esta ROM. */
  readonly save: StoredSave | null;
}

export function useSramLocal(romId: string | null, storage?: SaveStorage): EstadoDoSramLocal {
  const [estado, setEstado] = useState<EstadoDoSramLocal>({
    pending: romId !== null,
    save: null,
  });

  useEffect(() => {
    if (romId === null) {
      setEstado({ pending: false, save: null });
      return;
    }

    let cancelado = false;
    setEstado({ pending: true, save: null });

    void (async () => {
      try {
        // `storage` injetado é só para teste — jsdom não tem OPFS nem
        // IndexedDB, e sem isso não daria para afirmar "há SRAM local" sem
        // depender do fallback em memória, que `createSaveStorage()` recria
        // do zero a cada chamada (nada para semear).
        const resolvido = storage ?? (await createSaveStorage());
        const save = await resolvido.read(sramKey(romId));
        if (!cancelado) setEstado({ pending: false, save });
      } catch {
        // Sem storage disponível (aba anônima sem OPFS nem IndexedDB, ou erro
        // de leitura): não há SRAM local para oferecer, então o resultado é o
        // mesmo de "não existe" — a tela simplesmente não mostra a oferta.
        if (!cancelado) setEstado({ pending: false, save: null });
      }
    })();

    return () => {
      cancelado = true;
    };
  }, [romId, storage]);

  return estado;
}
