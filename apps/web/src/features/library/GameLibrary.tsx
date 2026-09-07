import { Link } from '@tanstack/react-router';
import type { Game } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { Cartucho } from './Cartucho.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { useGames } from './use-games.js';

export function GameLibrary() {
  const { data: games, isPending, error } = useGames();

  if (isPending) {
    return (
      <Prateleira>
        {Array.from({ length: 12 }, (_, i) => (
          <div key={i} className="h-[17rem] w-14 shrink-0 animate-pulse bg-ink-900" />
        ))}
      </Prateleira>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';
    return (
      <div className="mx-6 border-l-2 border-alert bg-ink-900 p-5">
        <h3 className="titulo-estampado text-sm text-label-100">O acervo não respondeu</h3>
        <p className="mt-1 text-sm text-ink-500">{detalhe}</p>
        <p className="leitura mt-3 text-ink-700">verifique a API — pnpm dev</p>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="mx-6 border border-dashed border-ink-850 p-8">
        <h3 className="titulo-estampado text-sm text-label-100">A prateleira está vazia</h3>
        <p className="mt-1 text-sm text-ink-500">
          Rode <code className="leitura text-label-200">pnpm db:seed</code> para trazer os
          homebrews.
        </p>
      </div>
    );
  }

  return (
    <section>
      <EtiquetaDeGaveta
        nome="Catálogo público"
        itens={games.length}
        nota="homebrew · jogável sem conta"
      />
      <Prateleira>
        {games.map((game) => (
          <NaPrateleira key={game.id} game={game} />
        ))}
      </Prateleira>
    </section>
  );
}

/**
 * Homebrew sai da prateleira e vai para o console. O resto é ficha de acervo:
 * o metadado é nosso, a ROM é da pessoa. O cartucho desbotado diz isso antes
 * do clique, em vez de levar a uma tela que só sabe explicar por que não dá.
 */
function NaPrateleira({ game }: { readonly game: Game }) {
  const selo = [game.publisher, game.releaseYear].filter(Boolean).join(' · ') || undefined;

  if (!game.isHomebrew) {
    return (
      <div className="group" title={`${game.title} — precisa da sua ROM`}>
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
