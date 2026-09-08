import { Link } from '@tanstack/react-router';
import { Cartucho } from './Cartucho.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { urlDaLombadaLocal, useRomsLocais } from './local-roms.js';

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
          <Link
            key={rom.id}
            to="/meus-jogos/$id"
            params={{ id: rom.id }}
            className="group block outline-none"
            aria-label={`Jogar ${rom.title}`}
          >
            <Cartucho
              titulo={rom.title}
              systemId={rom.systemId}
              selo={`${(rom.sizeBytes / 1024).toFixed(0)} KB`}
              lombadaUrl={urlDaLombadaLocal(rom)}
            />
          </Link>
        ))}
      </Prateleira>
    </section>
  );
}
