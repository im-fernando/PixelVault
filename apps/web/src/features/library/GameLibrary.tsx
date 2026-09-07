import { ApiRequestError } from '../../lib/api.js';
import { useGames } from './use-games.js';

export function GameLibrary() {
  const { data: games, isPending, error } = useGames();

  if (isPending) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="aspect-[3/4] animate-pulse rounded-lg bg-vault-800" />
        ))}
      </div>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';

    return (
      <div className="rounded-lg border border-vault-700 bg-vault-900 p-6">
        <h2 className="font-semibold text-accent">Falha ao carregar a biblioteca</h2>
        <p className="mt-1 text-sm text-vault-300">{detalhe}</p>
        <p className="mt-3 text-xs text-vault-700">
          A API está rodando? <code className="text-vault-300">pnpm dev</code>
        </p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-vault-700 p-10 text-center">
        <p className="text-vault-300">O catálogo ainda está vazio.</p>
        <p className="mt-1 text-sm text-vault-700">
          Os jogos homebrew entram na M1, junto com o player.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {games.map((game) => (
        <li key={game.id} className="group">
          <div className="aspect-[3/4] overflow-hidden rounded-lg bg-vault-800 ring-1 ring-vault-700 transition group-hover:ring-accent">
            {game.coverUrl ? (
              <img
                src={game.coverUrl}
                alt={game.title}
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-full items-center justify-center p-3 text-center text-xs text-vault-700">
                sem capa
              </div>
            )}
          </div>
          <p className="mt-2 truncate text-sm font-medium">{game.title}</p>
          <p className="text-xs text-vault-700 uppercase">{game.systemId}</p>
        </li>
      ))}
    </ul>
  );
}
