import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { Gamepad2 } from 'lucide-react';
import { NotificacaoDeConquista } from '../features/achievements/NotificacaoDeConquista.js';
import { PainelDeConquistas } from '../features/achievements/PainelDeConquistas.js';
import { CadastroPage } from '../features/auth/CadastroPage.js';
import { ConfiguracoesPage } from '../features/auth/ConfiguracoesPage.js';
import { ContaNoCabecalho } from '../features/auth/ContaNoCabecalho.js';
import { LoginPage } from '../features/auth/LoginPage.js';
import { RecuperarSenhaPage } from '../features/auth/RecuperarSenhaPage.js';
import { RedefinirSenhaPage } from '../features/auth/RedefinirSenhaPage.js';
import { exigirSessao, retornoSeguro } from '../features/auth/rota-protegida.js';
import { ConsolePage } from '../features/console/ConsolePage.js';
import { ConsolePlayPage } from '../features/console/ConsolePlayPage.js';
import { EnviarRomPage } from '../features/library/EnviarRomPage.js';
import { GameLibrary } from '../features/library/GameLibrary.js';
import { LocalLibrary } from '../features/library/LocalLibrary.js';
import { MinhaBiblioteca } from '../features/library/MinhaBiblioteca.js';
import { usePreferenciaDeHome } from '../features/library/use-preferencia-de-home.js';
import { Vitrine } from '../features/library/Vitrine.js';
import { LeaderboardPage } from '../features/leaderboards/LeaderboardPage.js';
import { BibliotecaPlayPage } from '../features/player/BibliotecaPlayPage.js';
import { LocalPlayPage } from '../features/player/LocalPlayPage.js';
import { PlayPage } from '../features/player/PlayPage.js';
import { PerfilPublicoPage } from '../features/profile/PerfilPublicoPage.js';
import { classesDaPilula } from '../ui/Botao.js';

/**
 * O modo console (#116) é para ser "tela cheia, tipo ligar um console de
 * verdade" — pedido explícito do Fernando, não estética nossa. Isso significa
 * sem o cabeçalho do site por cima, mas toda rota hoje é filha de `rootRoute`
 * e passa por este `Shell` via `<Outlet />` — não existe (ainda) uma segunda
 * raiz de layout no TanStack Router aqui.
 *
 * A saída mais simples e correta dado como o roteador está montado: o próprio
 * `Shell` decide, pelo path atual (`useRouterState`), se desenha o
 * `<header>`. Alternativas consideradas e descartadas:
 * - Duas árvores de rota com `createRootRoute` diferentes: o TanStack Router
 *   só aceita UMA raiz por `router`; teria que trocar para layout routes
 *   (`_layout`), uma reestruturação grande para uma tela só.
 *   `beforeLoad`/`context` para "avisar" o Shell também não existe como
 *   mecanismo pronto no `Register` daqui.
 * - CSS escondendo o `<header>` com `:has()` ou seletor de rota: a marcação
 *   do cabeçalho continuaria no DOM, e o modo console já tem o próprio
 *   `.topbar` cobrindo o topo — duas barras competindo por z-index é pior do
 *   que checar o path.
 *
 * O preço desta escolha é o `Shell` conhecer a existência da rota `/console`
 * (uma pontinha de acoplamento na direção "errada"). É pequeno e local a este
 * arquivo — o `ConsolePage` em si não sabe nada sobre o `Shell`.
 */
function Shell() {
  const emModoConsole = useRouterState({
    select: (state) => state.location.pathname.startsWith('/console'),
  });

  if (emModoConsole) return <Outlet />;

  return (
    <div className="pv-shell">
      <a href="#conteudo-principal" className="pv-pular-conteudo">
        Pular para o conteúdo
      </a>
      {/*
        A mesma luz do tema Aurora do console: dois anéis em órbita e um
        gradiente radial sobre a tinta. Fica fixa atrás de tudo, para o site
        inteiro ser a mesma sala em que o console acende.
      */}
      <div className="pv-atmosfera" aria-hidden="true">
        <i />
        <i />
      </div>

      <header className="pv-cabecalho">
        {/*
          A marca é a mesma do console: o símbolo "pv" inclinado e o nome
          estampado com a assinatura embaixo. Quem vai da home ao console e
          volta precisa reconhecer o mesmo produto nos dois lados.
        */}
        <Link to="/" className="pv-marca" aria-label="PixelVault — início">
          <span className="pv-marca-simbolo" aria-hidden="true">
            p<span>v</span>
          </span>
          <span className="pv-marca-nome">
            PIXELVAULT<small>PLAY YOUR WAY</small>
          </span>
        </Link>
        {/*
          "Enviar ROM" fica visível para todo mundo, inclusive para quem não
          entrou: o BYOR é a razão de existir de uma conta aqui, e esconder a
          porta de quem ainda não tem uma esconde o motivo de criar. Quem
          chegar deslogado é levado ao login pelo `exigirSessao` da rota, com
          o `retorno` que traz a pessoa de volta para cá — o mesmo caminho
          que `/configuracoes` já usa. "Conquistas" é a vitrine da #121 e
          ganha o mesmo tratamento.
        */}
        <nav className="pv-nav" aria-label="Principal">
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ 'aria-current': 'page' }}>
            Acervo
          </Link>
          <Link to="/enviar-rom" activeProps={{ 'aria-current': 'page' }}>
            Enviar ROM
          </Link>
          <Link to="/conquistas" activeProps={{ 'aria-current': 'page' }}>
            Conquistas
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-3">
          {/*
            "Modo console" só faz sentido para quem já tem biblioteca —
            `exigirSessao` cuida disso na própria rota. Fica como pílula, e
            não como item da navegação, porque não é uma página do site: é
            a porta para a outra metade do produto.
          */}
          <Link
            to="/console"
            aria-label="Modo console"
            className={classesDaPilula({ variante: 'secundaria', pequena: true })}
          >
            <Gamepad2 size={15} />
            <span className="hidden sm:inline">Modo console</span>
          </Link>
          <ContaNoCabecalho />
        </div>
      </header>

      <main id="conteudo-principal" tabIndex={-1} className="pv-pagina pt-4 pb-10">
        <Outlet />
      </main>

      <footer className="pv-rodape">
        <p className="max-w-md leading-relaxed">
          Cartucho guarda o save numa pilha, e pilha acaba. Aqui não acaba: o acervo roda no
          navegador e o progresso fica onde você deixou.
        </p>
        <nav aria-label="Rodapé">
          <Link to="/">Acervo</Link>
          <Link to="/enviar-rom">Enviar ROM</Link>
          <Link to="/console">Modo console</Link>
          <Link to="/conquistas">Conquistas</Link>
        </nav>
        <span className="leitura text-ink-700">snes · o save fica</span>
      </footer>

      <NotificacaoDeConquista />
    </div>
  );
}

const rootRoute = createRootRoute({ component: Shell });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: function Biblioteca() {
    // A ordem é a resposta a "de quem é o acervo": primeiro o da pessoa, depois
    // o catálogo público, e por último o ensaio local de desenvolvimento — que
    // só aparece na máquina de quem montou um. Ver o cabeçalho de
    // `MinhaBiblioteca.tsx` para por que a estante pessoal mora aqui e não numa
    // rota própria.
    //
    // O catálogo público é a única peça opcional: quem só quer ver as
    // próprias ROMs desliga em `/conta`, e a preferência mora no navegador,
    // não na conta — ver `preferencia-de-home.ts`.
    const { preferencia } = usePreferenciaDeHome();

    return (
      <>
        <Vitrine />
        <MinhaBiblioteca />
        {preferencia.catalogoPublico && <GameLibrary />}
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

/**
 * Joga uma ROM da própria biblioteca — o caminho real que a #99 entrega,
 * ao lado do catálogo público (`playRoute`) e do ensaio local
 * (`meusJogosRoute`). Exige sessão: a ROM é privada da conta (BYOR).
 */
const bibliotecaPlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/biblioteca/$romId',
  beforeLoad: exigirSessao,
  component: function JogarDaBiblioteca() {
    const { romId } = bibliotecaPlayRoute.useParams();
    return <BibliotecaPlayPage key={romId} romId={romId} />;
  },
});

const meusJogosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/meus-jogos/$id',
  component: function MeusJogos() {
    return <LocalPlayPage id={meusJogosRoute.useParams().id} />;
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

const recuperarSenhaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/recuperar-senha',
  component: RecuperarSenhaPage,
});

/**
 * O destino do link do e-mail. O token vem na busca da URL, e é só isso que
 * esta rota aceita de lá: qualquer outro parâmetro é descartado, e um token
 * que não seja texto vira `undefined` — a tela trata os dois casos como
 * "link inválido, peça outro", que é a única instrução útil.
 */
const redefinirSenhaRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/redefinir-senha',
  validateSearch: (busca: Record<string, unknown>): { token?: string | undefined } => ({
    token: typeof busca['token'] === 'string' ? busca['token'] : undefined,
  }),
  component: function Redefinir() {
    return <RedefinirSenhaPage token={redefinirSenhaRoute.useSearch().token} />;
  },
});

/**
 * Todo caminho de primeiro nível desta árvore é também um handle reservado
 * pelo contrato (ver `HANDLES_RESERVADOS`): ninguém pode se cadastrar com
 * esses nomes, então a rota de perfil `/u/:handle` da M6 não vai colidir com
 * nenhuma delas. Rota nova aqui pede palavra nova lá.
 */
const configuracoesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/configuracoes',
  beforeLoad: exigirSessao,
  component: ConfiguracoesPage,
});

/**
 * A mesa de recepção do acervo, em rota própria de primeiro nível.
 *
 * Não é um painel dentro da home porque enviar é uma tarefa com começo, meio e
 * fim — e com um passo de verificação que pode demorar (docs/adr/0014). Uma
 * URL própria é o que permite sair da página, voltar pelo histórico e mandar o
 * link para si mesmo no celular. `enviar-rom` entrou em `HANDLES_RESERVADOS`
 * junto com a rota, pela regra que o comentário do `configuracoesRoute`
 * enuncia: caminho novo de primeiro nível pede palavra nova lá.
 */
const enviarRomRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/enviar-rom',
  beforeLoad: exigirSessao,
  component: EnviarRomPage,
});

/**
 * O modo console (#116): tela cheia, navegável 100% por joystick — ver o
 * comentário do `Shell` para como a rota escapa do cabeçalho do site.
 * Exige sessão porque não existe modo console sem biblioteca pessoal para
 * navegar; mesma porta que `/enviar-rom` e `/biblioteca/$romId` usam.
 */
const consoleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/console',
  beforeLoad: exigirSessao,
  validateSearch: (busca: Record<string, unknown>): { jogo?: string } =>
    typeof busca.jogo === 'string' ? { jogo: busca.jogo } : {},
  component: function BibliotecaDoConsole() {
    return <ConsolePage jogoInicial={consoleRoute.useSearch().jogo} />;
  },
});

const consolePlayRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/console/$romId',
  beforeLoad: exigirSessao,
  component: function JogarNoConsole() {
    return (
      <ConsolePlayPage
        key={consolePlayRoute.useParams().romId}
        romId={consolePlayRoute.useParams().romId}
      />
    );
  },
});

/**
 * A vitrine de conquistas (#121) — rota própria, não só uma seção de
 * `/configuracoes`: o cabeçalho já linka `/enviar-rom` e `/console` como
 * destinos de primeiro nível para quem tem conta, e conquista pede o mesmo
 * tratamento (a tela é grande o bastante para não caber discretamente na
 * ficha da conta). Exige sessão pelo mesmo motivo das outras: conquista é da
 * conta, não do visitante.
 */
const conquistasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/conquistas',
  beforeLoad: exigirSessao,
  component: PainelDeConquistas,
});

/**
 * O ranking de playtime de um jogo (#122). Exige sessão pelo mesmo motivo de
 * `GET /api/leaderboards/games/:gameId`: a posição da própria conta só
 * existe para quem está logado, e mostrar o `top` sem ela seria uma tela
 * incompleta do mesmo dado. `gameId` na URL, não `slug` — é a chave que o
 * ranking usa do lado do servidor, e a entrada para esta rota (o cartucho da
 * própria biblioteca) já tem o id em mãos, sem precisar resolver slug.
 */
const rankingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/ranking/$gameId',
  beforeLoad: exigirSessao,
  component: function Ranking() {
    return <LeaderboardPage gameId={rankingRoute.useParams().gameId} />;
  },
});

/**
 * O perfil público de uma conta (#123) — `/u/:handle`, propositalmente SEM
 * `beforeLoad: exigirSessao`: ao contrário de quase toda rota autenticada
 * deste arquivo, esta precisa ser vista por quem não tem conta nenhuma. É a
 * "camada social" que o ADR 0006 menciona como razão de existir o `game_id`
 * canônico — nome de exibição, conquistas desbloqueadas e estatística
 * agregada, nunca a biblioteca de ROMs (privada, BYOR) nem posição de
 * ranking (o ranking da #122 é por jogo, não geral da conta).
 */
const perfilPublicoRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/u/$handle',
  component: function PerfilPublico() {
    return <PerfilPublicoPage handle={perfilPublicoRoute.useParams().handle} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  playRoute,
  bibliotecaPlayRoute,
  meusJogosRoute,
  enviarRomRoute,
  consoleRoute,
  consolePlayRoute,
  conquistasRoute,
  rankingRoute,
  perfilPublicoRoute,
  loginRoute,
  cadastroRoute,
  recuperarSenhaRoute,
  redefinirSenhaRoute,
  configuracoesRoute,
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
