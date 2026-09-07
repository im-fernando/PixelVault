import { Link } from '@tanstack/react-router';
import type { Game } from '@pixelvault/contracts';
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
          Rode <code className="text-vault-300">pnpm db:seed</code> para trazer os homebrews.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
      {games.map((game) => (
        <li key={game.id}>
          <CartaoDeJogo game={game} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Homebrew abre direto no player; o resto é metadado até a pessoa trazer a
 * própria ROM. O cartão diz isso antes do clique, em vez de levar a uma tela
 * que só sabe explicar por que não dá para jogar.
 */
function CartaoDeJogo({ game }: { readonly game: Game }) {
  const capa = (
    <div className="relative aspect-[3/4] overflow-hidden rounded-lg bg-vault-800 ring-1 ring-vault-700 transition group-hover:ring-accent">
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
      {game.isHomebrew && (
        <span className="absolute inset-x-0 bottom-0 bg-vault-950/85 py-1.5 text-center text-xs font-semibold text-accent opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          Jogar agora
        </span>
      )}
    </div>
  );

  const rodape = (
    <>
      <p className="mt-2 truncate text-sm font-medium">{game.title}</p>
      <p className="text-xs text-vault-700 uppercase">
        {game.systemId}
        {game.isHomebrew ? ' · homebrew' : ' · precisa da sua ROM'}
      </p>
    </>
  );

  if (!game.isHomebrew) {
    return (
      <div className="group opacity-70">
        {capa}
        {rodape}
      </div>
    );
  }

  return (
    <Link
      to="/play/$slug"
      params={{ slug: game.slug }}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {capa}
      {rodape}
    </Link>
  );
}
