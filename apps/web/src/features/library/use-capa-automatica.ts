import { useEffect, useState } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { urlsCandidatasDeLombada } from './nomes-no-libretro.js';

/** Resolve uma capa pública pelo título quando a ROM ainda não tem catálogo. */
export function useCapaAutomatica(titulo: string, systemId: SystemId | null): string | null {
  const [urlResolvida, setUrlResolvida] = useState<string | null>(null);

  useEffect(() => {
    setUrlResolvida(null);
    if (systemId === null) return;
    const sistema = systemId;

    let cancelado = false;

    async function tentarCandidatas() {
      for (const url of urlsCandidatasDeLombada(titulo, sistema)) {
        const carregou = await new Promise<boolean>((resolve) => {
          const imagem = new Image();
          imagem.onload = () => resolve(true);
          imagem.onerror = () => resolve(false);
          imagem.src = url;
        });
        if (cancelado) return;
        if (carregou) {
          setUrlResolvida(url);
          return;
        }
      }
    }

    void tentarCandidatas();
    return () => {
      cancelado = true;
    };
  }, [titulo, systemId]);

  return urlResolvida;
}
