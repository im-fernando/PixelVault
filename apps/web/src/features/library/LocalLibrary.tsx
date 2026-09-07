import { Link } from '@tanstack/react-router';
import { Cartucho } from './Cartucho.js';
import { useRomsLocais } from './local-roms.js';

/**
 * As ROMs pessoais, na mesma prateleira do catálogo — porque para quem joga
 * são a mesma coisa. O que muda é a procedência, e é isso que o rótulo diz.
 */
export function LocalLibrary() {
  const { data: roms } = useRomsLocais();
  if (roms === undefined || roms.length === 0) return null;

  return (
    <section className="mt-14">
      <Cabecalho titulo="Meus jogos" contagem={roms.length} nota="não saem desta máquina" />
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {roms.map((rom) => (
          <li key={rom.id}>
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
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O cabeçalho de seção do acervo: nome, quantidade e procedência.
 *
 * A contagem não é enfeite — num acervo, saber quantos itens a seção tem é
 * parte de consultá-la.
 */
export function Cabecalho({
  titulo,
  contagem,
  nota,
}: {
  readonly titulo: string;
  readonly contagem?: number | undefined;
  readonly nota?: string | undefined;
}) {
  return (
    <div className="mb-4 flex items-baseline gap-3 border-b border-ink-850 pb-2">
      <h2 className="titulo-estampado text-base text-label-100">{titulo}</h2>
      {contagem !== undefined && <span className="leitura text-ink-700">{contagem}</span>}
      {nota !== undefined && <span className="ml-auto text-xs text-ink-700">{nota}</span>}
    </div>
  );
}
