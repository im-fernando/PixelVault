import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import { GameLibrary } from '../features/library/GameLibrary.js';
import { Cabecalho, LocalLibrary } from '../features/library/LocalLibrary.js';
import { LocalPlayPage } from '../features/player/LocalPlayPage.js';
import { PlayPage } from '../features/player/PlayPage.js';

function Shell() {
  return (
    <div className="min-h-screen">
      {/*
        A marca é estampada como a faixa de nome de uma etiqueta de cartucho:
        larga, apertada, caixa alta. É o único lugar da interface onde a
        tipografia grita — o resto fica quieto, para a prateleira ser o que se
        vê. Ver docs/design.md.
      */}
      <header className="border-b border-ink-850">
        <div className="mx-auto flex max-w-6xl items-baseline gap-6 px-6 py-5">
          <Link
            to="/"
            className="titulo-estampado text-xl leading-none outline-none focus-visible:underline"
          >
            Pixel<span className="text-label-400">Vault</span>
          </Link>
          <nav className="text-sm text-ink-500">
            <Link to="/" className="hover:text-label-100">
              Acervo
            </Link>
          </nav>
          <span className="leitura ml-auto hidden text-ink-700 sm:block">snes · o save fica</span>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Biblioteca() {
    return (
      <>
        {/*
          A tese da home, e a razão do produto existir: a pilha do cartucho
          morre e leva o progresso junto. O PixelVault é o oposto disso.
        */}
        <p className="mb-10 max-w-lg text-sm leading-relaxed text-ink-500">
          Cartucho guarda o save numa pilha, e pilha acaba.{' '}
          <span className="text-label-100">Aqui não acaba.</span> Seu acervo, jogável no navegador,
          com o progresso onde você deixou.
        </p>
        <Cabecalho titulo="Catálogo público" nota="homebrew · jogável sem conta" />
        <GameLibrary />
        <LocalLibrary />
      </>
    );
  },
});

const playRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/play/$slug',
  component: function Jogar() {
    const { slug } = playRoute.useParams();
    // `key`: trocar de jogo pela URL precisa recriar o player do zero. Sem
    // isso, o React reaproveitaria o componente e o emulador teria que
    // adivinhar que a ROM mudou.
    return <PlayPage key={slug} slug={slug} />;
  },
});

const meusJogosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meus-jogos/$id',
  component: function MeusJogos() {
    return <LocalPlayPage id={meusJogosRoute.useParams().id} />;
  },
});

const routeTree = rootRoute.addChildren([indexRoute, playRoute, meusJogosRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
