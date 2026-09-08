import { createRootRoute, createRoute, createRouter, Link, Outlet } from '@tanstack/react-router';
import { CadastroPage } from '../features/auth/CadastroPage.js';
import { ConfiguracoesPage } from '../features/auth/ConfiguracoesPage.js';
import { ContaNoCabecalho } from '../features/auth/ContaNoCabecalho.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { exigirSessao, retornoSeguro } from '../features/auth/rota-protegida.js';
import { GameLibrary } from '../features/library/GameLibrary.js';
import { Frontispicio } from '../features/library/Frontispicio.js';
import { LocalLibrary } from '../features/library/LocalLibrary.js';
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
        <div className="flex items-center gap-6 px-6 py-5">
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
          <span className="leitura hidden text-ink-700 lg:block">snes · o save fica</span>
          <ContaNoCabecalho />
        </div>
      </header>
      <main className="py-10">
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
        <Frontispicio />
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
    return (
      <div className="mx-auto max-w-6xl px-6">
        <PlayPage key={slug} slug={slug} />
      </div>
    );
  },
});

const meusJogosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meus-jogos/$id',
  component: function MeusJogos() {
    return (
      <div className="mx-auto max-w-6xl px-6">
        <LocalPlayPage id={meusJogosRoute.useParams().id} />
      </div>
    );
  },
});

/**
 * `retorno` na URL, e não no estado da navegação: quem chega ao login por um
 * link direto ou por um F5 no meio do caminho precisa levar o destino junto,
 * e estado de navegação não sobrevive a nenhum dos dois.
 *
 * A peneira do `retornoSeguro` mora aqui, na borda que lê a barra de
 * endereço, e não na tela que usa o valor — assim não existe caminho pelo
 * qual um destino externo entre na aplicação.
 *
 * `retorno: undefined` explícito, e não a chave ausente: o roteador MESCLA o
 * que este validador devolve sobre a busca crua da URL, então omitir a chave
 * deixaria passar o valor original intacto — que é justamente o que a peneira
 * precisa impedir.
 */
function buscaComRetorno(busca: Record<string, unknown>): { retorno?: string | undefined } {
  return { retorno: retornoSeguro(busca['retorno']) };
}

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  validateSearch: buscaComRetorno,
  component: function Entrar() {
    return <LoginPage retorno={loginRoute.useSearch().retorno} />;
  },
});

const cadastroRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/cadastro',
  validateSearch: buscaComRetorno,
  component: function Cadastrar() {
    return <CadastroPage retorno={cadastroRoute.useSearch().retorno} />;
  },
});

/**
 * `/login`, `/cadastro` e `/configuracoes` são exatamente três dos handles
 * que o contrato reserva (ver `HANDLES_RESERVADOS`): ninguém pode se
 * cadastrar com esses nomes, então a rota de perfil `/u/:handle` da M6 não
 * vai colidir com nenhuma delas.
 */
const configuracoesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configuracoes',
  beforeLoad: exigirSessao,
  component: ConfiguracoesPage,
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  playRoute,
  meusJogosRoute,
  loginRoute,
  cadastroRoute,
  configuracoesRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
