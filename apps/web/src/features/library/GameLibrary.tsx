import { Link } from '@tanstack/react-router';
import type { Game } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { Aviso, Vazio } from '../../ui/Painel.js';
import { Cartucho, MioloDoCartucho } from './Cartucho.js';
import { CartuchoEsqueleto, EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { useGames } from './use-games.js';

export function GameLibrary() {
  const { data: games, isPending, error } = useGames();

  if (isPending) {
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <Prateleira>
          {Array.from({ length: 8 }, (_, i) => (
            <CartuchoEsqueleto key={i} />
          ))}
        </Prateleira>
      </section>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <Aviso titulo="O acervo não respondeu" className="mt-5">
          {detalhe}
          <p className="leitura mt-3 text-ink-700">verifique a API — pnpm dev</p>
        </Aviso>
      </section>
    );
  }

  if (games.length === 0) {
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <Vazio className="mt-5" titulo="A prateleira está vazia.">
          Rode <code className="leitura text-label-200">pnpm db:seed</code> para trazer os
          homebrews.
        </Vazio>
      </section>
    );
  }

  return (
    <section className="mt-10">
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
  const nota = [game.publisher, game.releaseYear].filter(Boolean).join(' · ') || undefined;

  if (!game.isHomebrew) {
    return (
      <Cartucho
        titulo={game.title}
        systemId={game.systemId}
        capaUrl={game.coverUrl}
        nota={nota}
        selo="Precisa da sua ROM"
        desbotado
      />
    );
  }

  return (
    <Link
      to="/play/$slug"
      params={{ slug: game.slug }}
      className="pv-cartucho"
      aria-label={`Jogar ${game.title}`}
    >
      <MioloDoCartucho
        titulo={game.title}
        systemId={game.systemId}
        capaUrl={game.coverUrl}
        nota={nota}
        selo="Homebrew"
      />
    </Link>
  );
}
