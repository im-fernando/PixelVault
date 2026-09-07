import { Link } from '@tanstack/react-router';
import type { Game } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { Cartucho } from './Cartucho.js';
import { useGames } from './use-games.js';

export function GameLibrary() {
  const { data: games, isPending, error } = useGames();

  if (isPending) {
    return (
      <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
        {Array.from({ length: 8 }, (_, i) => (
          <li key={i} className="h-64 animate-pulse rounded-[3px_3px_8px_8px] bg-ink-900" />
        ))}
      </ul>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';

    return (
      <Aviso titulo="O acervo não respondeu">
        <p className="mt-1 text-sm text-ink-500">{detalhe}</p>
        <p className="leitura mt-3 text-ink-700">verifique a API — pnpm dev</p>
      </Aviso>
    );
  }

  if (games.length === 0) {
    return (
      <Aviso titulo="A prateleira está vazia">
        <p className="mt-1 text-sm text-ink-500">
          Rode <code className="leitura text-label-200">pnpm db:seed</code> para trazer os homebrews
          do catálogo público.
        </p>
      </Aviso>
    );
  }

  return (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-8">
      {games.map((game) => (
        <li key={game.id}>
          <NaPrateleira game={game} />
        </li>
      ))}
    </ul>
  );
}

/**
 * Homebrew sai da prateleira e vai para o console. O resto é ficha de acervo:
 * o metadado é nosso, a ROM é da pessoa. O cartucho diz isso antes do clique,
 * em vez de levar a uma tela que só sabe explicar por que não dá para jogar.
 */
function NaPrateleira({ game }: { readonly game: Game }) {
  const selo = [game.publisher, game.releaseYear].filter(Boolean).join(' · ') || undefined;

  if (!game.isHomebrew) {
    return (
      <div className="group" title="Precisa da sua ROM">
        <Cartucho
          titulo={game.title}
          systemId={game.systemId}
          selo={selo}
          capaUrl={game.coverUrl}
          desbotado
        />
      </div>
    );
  }

  return (
    <Link
      to="/play/$slug"
      params={{ slug: game.slug }}
      className="group block outline-none"
      aria-label={`Jogar ${game.title}`}
    >
      <Cartucho titulo={game.title} systemId={game.systemId} selo={selo} capaUrl={game.coverUrl} />
    </Link>
  );
}

function Aviso({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="border-l-2 border-alert bg-ink-900 p-6">
      <h2 className="titulo-estampado text-sm text-label-100">{titulo}</h2>
      {children}
    </div>
  );
}
