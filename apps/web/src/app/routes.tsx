import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import { GameLibrary } from '../features/library/GameLibrary.js';
import { PlayPage } from '../features/player/PlayPage.js';

function Shell() {
  return (
    <div className="min-h-screen">
      <header className="border-b border-vault-800">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-4">
          <Link to="/" className="text-lg font-bold tracking-tight">
            Pixel<span className="text-accent">Vault</span>
          </Link>
          <nav className="text-sm text-vault-300">
            <Link to="/" className="hover:text-vault-100">
              Biblioteca
            </Link>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
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
        <h1 className="mb-6 text-2xl font-bold">Biblioteca</h1>
        <GameLibrary />
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

const routeTree = rootRoute.addChildren([indexRoute, playRoute]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
