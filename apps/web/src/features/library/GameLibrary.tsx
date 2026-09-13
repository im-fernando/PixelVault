import { Link } from '@tanstack/react-router';
import type { Game } from '@pixelvault/contracts';
import { BotaoPilula } from '../../ui/Botao.js';
import { Aviso, Vazio } from '../../ui/Painel.js';
import { Cartucho, MioloDoCartucho } from './Cartucho.js';
import { CartuchoEsqueleto, EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { useGames } from './use-games.js';

export function GameLibrary() {
  const { data: games, isPending, error, refetch, isFetching } = useGames();

  if (isPending) {
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <p role="status" className="pv-ajuda">
          Carregando catálogo…
        </p>
        <Prateleira>
          {Array.from({ length: 8 }, (_, i) => (
            <CartuchoEsqueleto key={i} />
          ))}
        </Prateleira>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <Aviso
          titulo="Não foi possível carregar o catálogo"
          className="mt-5"
          acao={
            <BotaoPilula pequena disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? 'Tentando…' : 'Tentar novamente'}
            </BotaoPilula>
          }
        >
          Confira sua conexão e tente novamente em alguns instantes.
        </Aviso>
      </section>
    );
  }

  if (games.length === 0) {
    return (
      <section className="mt-10">
        <EtiquetaDeGaveta nome="Catálogo público" itens={0} nota="homebrew · jogável sem conta" />
        <Vazio className="mt-5" titulo="A prateleira está vazia.">
          Ainda não há jogos no catálogo público. Volte mais tarde para conferir as novidades.
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
