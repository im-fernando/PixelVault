import { Link } from '@tanstack/react-router';
import { useRomsLocais } from './local-roms.js';

/**
 * Seção da home com as ROMs pessoais. Não aparece quando não há manifesto —
 * é recurso de desenvolvimento, não parte do produto público.
 */
export function LocalLibrary() {
  const { data: roms } = useRomsLocais();
  if (roms === undefined || roms.length === 0) return null;

  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline gap-3">
        <h2 className="text-lg font-semibold">Meus jogos</h2>
        <span className="rounded-full border border-vault-800 px-2 py-0.5 text-xs text-vault-700">
          local · não sai da sua máquina
        </span>
      </div>

      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {roms.map((rom) => (
          <li key={rom.id}>
            <Link to="/meus-jogos/$id" params={{ id: rom.id }} className="group block">
              <div className="flex aspect-[3/4] items-center justify-center rounded-lg border border-dashed border-vault-700 bg-vault-900 p-3 text-center transition group-hover:border-accent">
                <span className="text-xs text-vault-700">{rom.systemId.toUpperCase()}</span>
              </div>
              <p className="mt-2 truncate text-sm font-medium">{rom.title}</p>
              <p className="text-xs text-vault-700">
                {(rom.sizeBytes / 1024).toFixed(0)} KB
                {rom.temHeaderDeCopiador && ' · com header'}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
