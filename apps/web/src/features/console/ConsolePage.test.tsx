// @vitest-environment jsdom
import { type ReactNode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProvedorDeSessao } from '../auth/sessao.js';
import { ConsolePage } from './ConsolePage.js';
import { CHAVE_PREFERENCIAS, TEMAS } from './temas.js';

/**
 * O critério de aceite da #116 pede navegação por gamepad físico — que este
 * ambiente não tem. O que se testa aqui é o fallback de teclado (setas/WASD),
 * que exercita a MESMA máquina de estado (`selecionarProximo`,
 * `alternarFavorito`, filtro de coleção, teclado virtual da busca) que o
 * polling de gamepad chama. A verificação com controle físico fica para
 * quando o Fernando testar (ver o corpo da issue).
 */

const USUARIO = {
  id: '22222222-2222-4222-8222-222222222222',
  email: 'dono@example.com',
  handle: 'dono',
  displayName: 'Dono da estante',
};

function romDaBiblioteca(sobrescritas: Record<string, unknown> = {}): unknown {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Alien vs. Predator',
    systemId: 'snes',
    gameId: null,
    coverUrl: null,
    fileName: 'avp.sfc',
    sizeBytes: 512 * 1024,
    sha256: 'a'.repeat(64),
    isFavorite: false,
    uploadedAt: new Date('2024-01-01').toISOString(),
    ...sobrescritas,
  };
}

const BIBLIOTECA = [
  romDaBiblioteca(),
  romDaBiblioteca({
    id: '22222222-2222-4222-8222-222222222222',
    title: 'Sonic Adventure 2',
    systemId: 'genesis',
  }),
  romDaBiblioteca({
    id: '33333333-3333-4333-8333-333333333333',
    title: 'Metroid Prime',
    systemId: 'gba',
    isFavorite: true,
  }),
];

function respostaJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/**
 * `ConsolePage` usa `<Link>`/`useNavigate` de verdade (o "Play" leva a
 * `/console/$romId`) — precisa de um router com essa rota registrada, não
 * só de uma raiz qualquer como o teste de `BibliotecaPlayPage` usa.
 */
function renderizarComRouter(elemento: ReactNode) {
  const rootRoute = createRootRoute({ component: () => elemento });
  const bibliotecaPlayRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/console/$romId',
    component: () => null,
  });
  const router = createRouter({
    routeTree: rootRoute.addChildren([bibliotecaPlayRoute]),
    history: createMemoryHistory({ initialEntries: ['/console'] }),
  });
  return { ...render(<RouterProvider router={router} />), router };
}

function clienteDeConsultaAutenticado(): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['sessao'], USUARIO);
  return queryClient;
}

function montar(favoritarFetch?: (url: string, init?: RequestInit) => Response | undefined) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes('/auth/me')) return respostaJson({ user: USUARIO });
      if (url.includes('/favorite')) {
        const resposta = favoritarFetch?.(url, init);
        if (resposta) return resposta;
      }
      if (url.includes('/library/roms')) return respostaJson(BIBLIOTECA);
      throw new Error(`fetch não esperado: ${url}`);
    }),
  );

  return renderizarComRouter(
    <QueryClientProvider client={clienteDeConsultaAutenticado()}>
      <ProvedorDeSessao>
        <ConsolePage />
      </ProvedorDeSessao>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  // O polling de gamepad roda em intervalo real (120ms) fora do controle do
  // teste; como nenhum destes testes usa fake timers, ele só teria efeito se
  // `navigator.getGamepads` existisse — não existe em jsdom, então o handler
  // retorna antes de tocar qualquer estado.
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ConsolePage', () => {
  it.each(TEMAS)('preserva seleção, filtro e rota de jogar ao aplicar $nome', async (tema) => {
    const { router } = montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'Menu' }));
    fireEvent.click(screen.getByRole('button', { name: 'GENESIS' }));
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('button', { name: `Tema ${tema.nome}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Voltar ao console' }));
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
    fireEvent.click(screen.getByRole('button', { name: /Iniciar jogo/i }));
    await waitFor(() =>
      expect(router.state.location.pathname).toBe('/console/22222222-2222-4222-8222-222222222222'),
    );
  });

  it('restaura tema e preferências ao entrar novamente no console', async () => {
    const primeira = montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tema Solstice' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Animações' }));
    fireEvent.click(screen.getByRole('switch', { name: 'Efeitos de ambiente' }));
    primeira.unmount();
    montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    expect(screen.getByRole('button', { name: 'Tema Solstice' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('switch', { name: 'Animações' }).getAttribute('aria-checked')).toBe(
      'false',
    );
    expect(
      screen.getByRole('switch', { name: 'Efeitos de ambiente' }).getAttribute('aria-checked'),
    ).toBe('false');
  });

  it('consome teclado e gamepad no painel sem navegar ou iniciar o jogo ao fundo', async () => {
    const { router } = montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });
    const buttons = Array.from({ length: 16 }, () => ({ pressed: false }));
    buttons[15]!.pressed = true;
    vi.stubGlobal('navigator', { getGamepads: () => [{ connected: true, buttons, axes: [0, 0] }] });
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Tema Solstice' })).toBe(document.activeElement),
    );
    buttons[15]!.pressed = false;
    buttons[0]!.pressed = true;
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Tema Solstice' }).getAttribute('aria-pressed'),
      ).toBe('true'),
    );
    expect(router.state.location.pathname).toBe('/console');
    buttons[0]!.pressed = false;
    fireEvent.keyDown(window, { key: 'Escape' });
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
  });

  it('abre o console mesmo com preferências inválidas no armazenamento', async () => {
    localStorage.setItem(CHAVE_PREFERENCIAS, '{inválido');
    montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'Configurações' }));
    expect(screen.getByRole('button', { name: 'Tema Aurora' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });

  it('troca de jogo em destaque com as setas do teclado (fallback sem gamepad)', async () => {
    montar();

    await screen.findByRole('heading', { name: 'Alien vs. Predator' });

    fireEvent.keyDown(window, { key: 'ArrowRight' });
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });

    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });

    // WASD é o fallback do fallback: mesma tecla, mesma máquina de estado.
    fireEvent.keyDown(window, { key: 'd' });
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
  });

  it('abre a busca e digita pelo teclado virtual usando as setas', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });

    fireEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    await screen.findByRole('dialog', { name: 'Pesquisar jogos' });

    // O cursor do teclado virtual começa na tecla "1" (índice 0). Duas setas
    // para a direita chegam em "3"; Enter digita a tecla focada.
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    fireEvent.keyDown(window, { key: 'Enter' });

    const campo = screen.getByPlaceholderText<HTMLInputElement>('Digite o nome do jogo...');
    expect(campo.value).toBe('3');

    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Pesquisar jogos' })).toBeNull();
    });
  });

  it('favorita pelo botão da tela e reflete no destaque', async () => {
    let romFavoritada: string | null = null;
    montar((url) => {
      romFavoritada = url;
      return respostaJson({
        romId: '11111111-1111-4111-8111-111111111111',
        isFavorite: true,
      });
    });

    await screen.findByRole('heading', { name: 'Alien vs. Predator' });
    fireEvent.click(screen.getByRole('button', { name: 'FAVORITAR' }));

    await waitFor(() => {
      expect(romFavoritada).toContain(
        '/library/roms/11111111-1111-4111-8111-111111111111/favorite',
      );
    });
  });

  it('filtra por sistema abrindo o menu com ArrowUp e clicando na coleção', async () => {
    montar();
    await screen.findByRole('heading', { name: 'Alien vs. Predator' });

    fireEvent.keyDown(window, { key: 'ArrowUp' });
    // `exact: true` (o padrão para nome em string): o cartucho da Sonic
    // Adventure 2 também tem "GENESIS" no próprio nome acessível (a etiqueta
    // de sistema dentro do botão do carrossel), então um regex aqui casaria
    // com os dois botões.
    const opcaoGenesis = await screen.findByRole('button', { name: 'GENESIS' });
    fireEvent.click(opcaoGenesis);

    // Com o filtro em GENESIS, só "Sonic Adventure 2" existe na coleção —
    // entra selecionado, e o SNES/GBA saem do alcance do D-pad.
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    // Lista de um item só: dar a volta continua no mesmo jogo.
    await screen.findByRole('heading', { name: 'Sonic Adventure 2' });
  });
});
