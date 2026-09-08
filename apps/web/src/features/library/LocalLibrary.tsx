import { Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { Cartucho } from './Cartucho.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { urlDaLombadaLocal, useRomsLocais, type RomLocal } from './local-roms.js';
import { urlsCandidatasDeLombada } from './nomes-no-libretro.js';

/**
 * Tenta, em ordem, cada URL candidata de capa no `libretro-thumbnails`, e
 * fica com a primeira que o navegador conseguir baixar.
 *
 * O `libretro-thumbnails` só cataloga capa frontal da caixa (`Named_Boxarts`),
 * tela de título e print — não existe foto de lombada em base pública nenhuma.
 * Por isso a imagem resolvida aqui alimenta `capaUrl` do `Cartucho`, que só
 * aparece quando o cartucho abre (hover/foco); a lombada fechada continua
 * sempre com a faixa de cor + título gerado, ver ADR 0016.
 *
 * Sem `HEAD` nem checagem prévia: cada candidata é testada com um `Image()`
 * de verdade — o mesmo carregamento que uma tag `<img>` faria, e sem precisar
 * de CORS, já que é só exibição — só que fora da árvore de DOM, para a
 * prateleira não piscar ícone de imagem quebrada enquanto tenta a próxima.
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
  const lombadaUrl = urlDaLombadaLocal(rom);

  return (
    <Link
      to="/meus-jogos/$id"
      params={{ id: rom.id }}
      className="group block outline-none"
      aria-label={`Jogar ${rom.title}`}
    >
      <Cartucho
        titulo={rom.title}
        systemId={rom.systemId}
        selo={`${(rom.sizeBytes / 1024).toFixed(0)} KB`}
        capaUrl={capaUrl}
        lombadaUrl={lombadaUrl}
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
    <section className="mt-12">
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
