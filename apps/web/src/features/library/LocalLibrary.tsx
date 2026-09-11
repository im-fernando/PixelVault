import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { MioloDoCartucho } from './Cartucho.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { useRomsLocais, type RomLocal } from './local-roms.js';
import { urlsCandidatasDeLombada } from './nomes-no-libretro.js';

/**
 * Tenta, em ordem, cada URL candidata de capa no `libretro-thumbnails`, e
 * fica com a primeira que o navegador conseguir baixar.
 *
 * Sem `HEAD` nem checagem prévia: cada candidata é testada com um `Image()`
 * de verdade — o mesmo carregamento que uma tag `<img>` faria, e sem precisar
 * de CORS, já que é só exibição — só que fora da árvore de DOM, para a
 * prateleira não piscar ícone de imagem quebrada enquanto tenta a próxima.
 * Enquanto nenhuma responde, a arte substituta (matiz por título) segura a
 * moldura.
 */
function useCapaAutomatica(titulo: string, systemId: SystemId): string | null {
  const [urlResolvida, setUrlResolvida] = useState<string | null>(null);

  useEffect(() => {
    setUrlResolvida(null);

    let cancelado = false;

    async function tentarCandidatas() {
      for (const url of urlsCandidatasDeLombada(titulo, systemId)) {
        const carregou = await new Promise<boolean>((resolve) => {
          const img = new Image();
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
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

function ItemDaEstante({ rom }: { readonly rom: RomLocal }) {
  const capaUrl = useCapaAutomatica(rom.title, rom.systemId);

  return (
    <Link
      to="/meus-jogos/$id"
      params={{ id: rom.id }}
      className="pv-cartucho"
      aria-label={`Jogar ${rom.title}`}
    >
      <MioloDoCartucho
        titulo={rom.title}
        systemId={rom.systemId}
        capaUrl={capaUrl}
        nota={`${rom.systemId.toUpperCase()} · ${(rom.sizeBytes / 1024).toFixed(0)} KB`}
        selo="Local"
      />
    </Link>
  );
}

/**
 * As ROMs pessoais, na mesma estante do catálogo — porque para quem joga são a
 * mesma coisa. O que muda é a procedência, e é isso que a etiqueta da gaveta diz.
 */
export function LocalLibrary() {
  const { data: roms } = useRomsLocais();
  if (roms === undefined || roms.length === 0) return null;

  const total = roms.reduce((soma, rom) => soma + rom.sizeBytes, 0);

  return (
    <section className="mt-10">
      <EtiquetaDeGaveta
        nome="Meus jogos"
        itens={roms.length}
        bytes={total}
        nota="não saem desta máquina"
      />
      <Prateleira>
        {roms.map((rom) => (
          <ItemDaEstante key={rom.id} rom={rom} />
        ))}
      </Prateleira>
    </section>
  );
}
