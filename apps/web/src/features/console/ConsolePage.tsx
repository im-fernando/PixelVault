import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ChevronLeft,
  ChevronRight,
  Gamepad2,
  Heart,
  Menu,
  Play,
  Search,
  Settings2,
  Volume2,
  X,
} from 'lucide-react';
import type { LibraryRom, SystemId } from '@pixelvault/contracts';
import { useBiblioteca, useFavoritarRom } from '../library/use-biblioteca.js';
import './console.css';

/**
 * Modo console — navegar a própria biblioteca 100% por joystick (issue #116).
 *
 * Portado de um protótipo que o Fernando fez no Manus (`retrobox-arcade`):
 * carrossel de jogos, polling de gamepad a cada 120ms com detecção de borda
 * (`navigator.getGamepads()`), teclado (setas/WASD) como fallback, teclado
 * virtual em tela para buscar sem teclado físico, favoritos e filtro por
 * coleção/sistema. O visual é o dele, de propósito (ver `console.css`) — não
 * é a direção "Arquivo" do resto do site.
 *
 * ## O que é fiel ao protótipo e o que foi adaptado
 *
 * Fiel: toda a máquina de navegação (polling, edge-detection, teclado
 * virtual, atalhos) e a folha de estilo.
 *
 * Adaptado: a fonte de dados. O protótipo tinha um array fixo de jogos de
 * mentira com nota, ano, gênero e descrição — nada disso existe na
 * biblioteca real (`LibraryRom`). Aqui só entra o que é real: título,
 * sistema, capa (quando existe), tamanho do arquivo e data de envio. O nome
 * do tema ("FANARTSTAR") e do app ("RETROBAT") do showcase original foram
 * trocados pela marca do produto — eram só o rótulo de demonstração do
 * protótipo, não conteúdo que o Fernando pediu para preservar.
 *
 * "Play" leva a `/biblioteca/$romId`, a rota real de jogar (#99) — não
 * simula.
 */

type ItemDoConsole = {
  readonly id: string;
  readonly titulo: string;
  readonly sistema: SystemId | null;
  readonly capaUrl: string | null;
  readonly favorito: boolean;
  readonly tamanho: string;
  readonly enviadoEm: string;
};

const TODOS = 'TODOS OS JOGOS';
const FAVORITOS = 'FAVORITOS';

const virtualKeyboard = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['Z', 'X', 'C', 'V', 'B', 'N', 'M', '-', '_'],
];
const keyboardKeys = virtualKeyboard.flat();

function emBytesLegiveis(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function paraItem(rom: LibraryRom): ItemDoConsole {
  return {
    id: rom.id,
    titulo: rom.title,
    sistema: rom.systemId,
    capaUrl: rom.coverUrl,
    favorito: rom.isFavorite,
    tamanho: emBytesLegiveis(rom.sizeBytes),
    enviadoEm: new Date(rom.uploadedAt).toLocaleDateString('pt-BR'),
  };
}

export function ConsolePage() {
  const biblioteca = useBiblioteca();
  const favoritar = useFavoritarRom();
  const navigate = useNavigate();

  const jogos = useMemo(() => (biblioteca.data ?? []).map(paraItem), [biblioteca.data]);

  const colecoes = useMemo(() => {
    const sistemas = Array.from(
      new Set(jogos.map((jogo) => jogo.sistema).filter((s): s is SystemId => s !== null)),
    ).sort();
    return [TODOS, FAVORITOS, ...sistemas.map((s) => s.toUpperCase())];
  }, [jogos]);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [colecao, setColecao] = useState(TODOS);
  const [query, setQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [keyboardCursor, setKeyboardCursor] = useState(0);
  const [aviso, setAviso] = useState<string | null>(null);
  const gamepadButtons = useRef<boolean[]>([]);

  // Assim que a biblioteca carrega, o primeiro jogo entra selecionado. Sem
  // isto o carrossel abriria sem destaque nenhum.
  useEffect(() => {
    if (selectedId === null && jogos.length > 0) setSelectedId(jogos[0]!.id);
  }, [jogos, selectedId]);

  const filtrados = useMemo(
    () =>
      jogos.filter((jogo) => {
        const bateBusca = jogo.titulo.toLowerCase().includes(query.toLowerCase());
        const bateColecao =
          colecao === TODOS
            ? true
            : colecao === FAVORITOS
              ? jogo.favorito
              : jogo.sistema?.toUpperCase() === colecao;
        return bateBusca && bateColecao;
      }),
    [jogos, query, colecao],
  );

  // A navegação anda dentro da lista FILTRADA — ao contrário do protótipo
  // original, que girava entre todos os jogos e só destacava a coleção no
  // carrossel (o D-pad "escapava" do filtro). Aqui filtrar de fato limita o
  // que o joystick alcança, que é o comportamento que faz sentido para
  // "navegar por coleção/sistema" pedido na issue.
  const indiceAtual = Math.max(
    0,
    filtrados.findIndex((jogo) => jogo.id === selectedId),
  );
  const selecionado = filtrados[indiceAtual] ?? null;
  const visiveis =
    filtrados.length <= 6
      ? filtrados
      : Array.from(
          { length: 6 },
          (_, offset) =>
            filtrados[(indiceAtual + offset - 2 + filtrados.length) % filtrados.length]!,
        );

  const selecionarProximo = (direcao: number) => {
    if (filtrados.length === 0) return;
    const proximo = (indiceAtual + direcao + filtrados.length) % filtrados.length;
    setSelectedId(filtrados[proximo]!.id);
  };

  const iniciarJogo = () => {
    if (selecionado === null) return;
    void navigate({ to: '/biblioteca/$romId', params: { romId: selecionado.id } });
  };

  const alternarFavorito = () => {
    if (selecionado === null) return;
    favoritar.mutate({ romId: selecionado.id, favorito: !selecionado.favorito });
    setAviso(selecionado.favorito ? 'Removido dos favoritos' : 'Adicionado aos favoritos');
  };

  const digitarTecla = (tecla: string) => setQuery((valor) => `${valor}${tecla}`.slice(0, 28));
  const apagarTecla = () => setQuery((valor) => valor.slice(0, -1));
  const fecharBusca = () => {
    setSearchOpen(false);
  };

  // Aviso próprio no lugar do `sonner` do protótipo (issue #116: decidir e
  // documentar). O projeto já tem uma convenção — `setAviso` +
  // `window.setTimeout` para limpar — em `EmulatorPlayer.tsx`. Introduzir uma
  // segunda biblioteca de notificação só para esta tela seria duplicar o que
  // já existe; este componente repete o mesmo padrão local em vez disso.
  useEffect(() => {
    if (aviso === null) return;
    const temporizador = window.setTimeout(() => setAviso(null), 2400);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  // Teclado (setas/WASD) como alternativa ao gamepad — é o caminho que dá
  // para testar sem controle físico e o que o critério de aceite da #116
  // pede para exercitar.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      const tecla = evento.key.toLowerCase();
      if (searchOpen) {
        if (
          [
            'arrowleft',
            'arrowright',
            'arrowup',
            'arrowdown',
            'w',
            'a',
            's',
            'd',
            'enter',
            'escape',
          ].includes(tecla)
        ) {
          evento.preventDefault();
        }
        if (tecla === 'escape') {
          fecharBusca();
          return;
        }
        if (tecla === 'enter') {
          digitarTecla(keyboardKeys[keyboardCursor]!);
          return;
        }
        if (tecla === 'arrowleft' || tecla === 'a') {
          setKeyboardCursor((cursor) => (cursor > 0 ? cursor - 1 : keyboardKeys.length - 1));
        }
        if (tecla === 'arrowright' || tecla === 'd') {
          setKeyboardCursor((cursor) => (cursor < keyboardKeys.length - 1 ? cursor + 1 : 0));
        }
        if (tecla === 'arrowup' || tecla === 'w') {
          setKeyboardCursor((cursor) => Math.max(0, cursor - 10));
        }
        if (tecla === 'arrowdown' || tecla === 's') {
          setKeyboardCursor((cursor) => Math.min(keyboardKeys.length - 1, cursor + 10));
        }
        return;
      }
      if (evento.key === 'ArrowLeft' || tecla === 'a') {
        evento.preventDefault();
        selecionarProximo(-1);
      }
      if (evento.key === 'ArrowRight' || tecla === 'd') {
        evento.preventDefault();
        selecionarProximo(1);
      }
      if (evento.key === 'ArrowUp' || tecla === 'w') {
        evento.preventDefault();
        setMenuOpen(true);
      }
      if (evento.key === 'ArrowDown' || tecla === 's') {
        evento.preventDefault();
        setMenuOpen(true);
      }
      if (evento.key === 'Enter') {
        evento.preventDefault();
        iniciarJogo();
      }
      if (evento.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  // Polling de gamepad a cada 120ms, com detecção de borda (botão que
  // acabou de ser pressionado, não o que está sendo mantido) — mesma lógica
  // do protótipo. `navigator.getGamepads` não dispara evento; sem polling
  // ativo nada se move.
  useEffect(() => {
    const consultarGamepad = () => {
      // `?.()?.[0]`, e não `?.()[0]`: em ambiente sem Gamepad API
      // (jsdom nos testes, e qualquer navegador que não o implemente)
      // `getGamepads` é `undefined`, e indexar `undefined[0]` sem a segunda
      // opcional derrubaria o polling com um TypeError a cada 120ms.
      const controle = navigator.getGamepads?.()?.[0];
      if (!controle) return;
      const pressionados = controle.buttons.map((botao) => botao.pressed);
      const jaEstavaPressionado = gamepadButtons.current;
      const acabouDeApertar = (indice: number) =>
        pressionados[indice] === true && jaEstavaPressionado[indice] !== true;
      if (searchOpen) {
        if (acabouDeApertar(14) || (acabouDeApertar(0) && controle.axes[0]! < -0.5)) {
          setKeyboardCursor((cursor) => (cursor > 0 ? cursor - 1 : keyboardKeys.length - 1));
        }
        if (acabouDeApertar(15) || (acabouDeApertar(0) && controle.axes[0]! > 0.5)) {
          setKeyboardCursor((cursor) => (cursor < keyboardKeys.length - 1 ? cursor + 1 : 0));
        }
        if (acabouDeApertar(12) || (acabouDeApertar(0) && controle.axes[1]! < -0.5)) {
          setKeyboardCursor((cursor) => Math.max(0, cursor - 10));
        }
        if (acabouDeApertar(13) || (acabouDeApertar(0) && controle.axes[1]! > 0.5)) {
          setKeyboardCursor((cursor) => Math.min(keyboardKeys.length - 1, cursor + 10));
        }
        if (acabouDeApertar(0)) digitarTecla(keyboardKeys[keyboardCursor]!);
        gamepadButtons.current = pressionados;
        return;
      }
      if (acabouDeApertar(14) || (acabouDeApertar(0) && controle.axes[0]! < -0.5))
        selecionarProximo(-1);
      if (acabouDeApertar(15) || (acabouDeApertar(0) && controle.axes[0]! > 0.5))
        selecionarProximo(1);
      if (acabouDeApertar(12) || (acabouDeApertar(0) && controle.axes[1]! < -0.5))
        setMenuOpen(true);
      if (acabouDeApertar(13) || (acabouDeApertar(0) && controle.axes[1]! > 0.5)) setMenuOpen(true);
      if (acabouDeApertar(0)) iniciarJogo();
      gamepadButtons.current = pressionados;
    };
    const intervalo = window.setInterval(consultarGamepad, 120);
    return () => window.clearInterval(intervalo);
  });

  if (biblioteca.isPending) {
    return (
      <div className="showcase-page" data-testid="modo-console-carregando">
        <div className="showcase-wash" />
      </div>
    );
  }

  if (jogos.length === 0) {
    return (
      <div className="showcase-page">
        <div className="showcase-wash" />
        <main className="showcase-shell">
          <div className="theme-title">
            <div className="theme-title-main">
              PIXEL<span>VAULT</span>
            </div>
            <div className="theme-title-sub">Modo console</div>
          </div>
          <div className="no-results" style={{ textAlign: 'center', marginTop: '2rem' }}>
            Sua biblioteca está vazia. Envie uma ROM para jogar por aqui.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="showcase-page">
      {selecionado?.capaUrl ? (
        <div className="showcase-bg" style={{ backgroundImage: `url(${selecionado.capaUrl})` }} />
      ) : (
        <div className="showcase-bg showcase-bg-placeholder" />
      )}
      <div className="showcase-wash" />
      <div className="scanlines" />

      <header className="topbar">
        <button
          type="button"
          className="round-control menu-control"
          onClick={() => setMenuOpen((open) => !open)}
          aria-label="Menu"
        >
          <Menu size={19} />
        </button>
        <div className="retro-logo">
          <span className="logo-orbit">P</span>
          <div>
            <strong>PIXELVAULT</strong>
            <small>MODO CONSOLE</small>
          </div>
        </div>
        <div className="topbar-center">
          <span className="online-light" /> BIBLIOTECA CARREGADA <i />
          {jogos.length} JOGO{jogos.length === 1 ? '' : 'S'}
        </div>
        <div className="topbar-actions">
          <button
            type="button"
            className="round-control"
            onClick={() => setSearchOpen((open) => !open)}
            aria-label="Buscar"
          >
            <Search size={17} />
          </button>
          <button
            type="button"
            className="round-control hide-mobile"
            onClick={() => setAviso('Volume do sistema — ajuste ainda não disponível aqui.')}
            aria-label="Volume"
          >
            <Volume2 size={17} />
          </button>
          <button
            type="button"
            className="round-control"
            onClick={() => setAviso('Configurações do sistema disponíveis em breve.')}
            aria-label="Configurações"
          >
            <Settings2 size={17} />
          </button>
        </div>
      </header>

      {aviso !== null && (
        <div
          role="status"
          style={{
            position: 'fixed',
            top: 84,
            right: 20,
            zIndex: 70,
            padding: '10px 16px',
            borderRadius: 8,
            background: 'rgba(10,12,20,.95)',
            border: '1px solid rgba(246,218,120,.4)',
            color: '#f6da78',
            fontSize: 12,
            letterSpacing: '.04em',
          }}
        >
          {aviso}
        </div>
      )}

      {searchOpen && (
        <div className="search-overlay">
          <button
            type="button"
            className="search-backdrop"
            onClick={fecharBusca}
            aria-label="Fechar pesquisa"
          />
          <div className="search-console" role="dialog" aria-label="Pesquisar jogos">
            <div className="search-console-head">
              <div>
                <span className="rail-label">PIXELVAULT / BUSCA</span>
                <h2>ENCONTRE SEU JOGO</h2>
              </div>
              <button
                type="button"
                className="round-control"
                onClick={fecharBusca}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="search-input-large">
              <Search size={21} />
              <input
                autoFocus
                value={query}
                onChange={(evento) => setQuery(evento.target.value)}
                placeholder="Digite o nome do jogo..."
              />
              <span>{query.length}/28</span>
            </div>
            <div className="search-results-label">
              {query
                ? `${filtrados.length} RESULTADO${filtrados.length === 1 ? '' : 'S'} ENCONTRADO${filtrados.length === 1 ? '' : 'S'}`
                : 'DIGITE PARA PESQUISAR NA BIBLIOTECA'}
            </div>
            <div className="virtual-keyboard">
              {virtualKeyboard.map((linha, indiceLinha) => (
                <div className="keyboard-row" key={indiceLinha}>
                  {linha.map((tecla) => {
                    const indiceTecla = keyboardKeys.indexOf(tecla);
                    return (
                      <button
                        type="button"
                        key={tecla}
                        className={keyboardCursor === indiceTecla ? 'keyboard-focused' : ''}
                        onClick={() => {
                          setKeyboardCursor(indiceTecla);
                          digitarTecla(tecla);
                        }}
                      >
                        {tecla}
                      </button>
                    );
                  })}
                </div>
              ))}
              <div className="keyboard-row keyboard-actions">
                <button type="button" onClick={() => digitarTecla(' ')} className="space-key">
                  ESPAÇO
                </button>
                <button type="button" onClick={apagarTecla} className="backspace-key">
                  ⌫ APAGAR
                </button>
                <button type="button" onClick={() => setQuery('')} className="clear-key">
                  LIMPAR
                </button>
              </div>
            </div>
            <div className="search-console-footer">
              <span>
                <b>↑↓←→ / WASD</b> MOVER
              </span>
              <span>
                <b>ENTER / A</b> DIGITAR
              </span>
              <span>
                <b>B / ESC</b> FECHAR
              </span>
            </div>
          </div>
        </div>
      )}

      {menuOpen && (
        <div className="menu-drawer">
          <div className="menu-title">
            PIXELVAULT{' '}
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Fechar menu">
              <X size={17} />
            </button>
          </div>
          <p>Selecione uma coleção abaixo para navegar pela sua biblioteca.</p>
          {colecoes.map((item) => (
            <button
              type="button"
              key={item}
              className={item === colecao ? 'active' : ''}
              onClick={() => {
                setColecao(item);
                setMenuOpen(false);
              }}
            >
              {item}
              <ChevronRight size={15} />
            </button>
          ))}
        </div>
      )}

      <main className="showcase-shell">
        <div className="theme-title">
          <div className="theme-title-main">
            PIXEL<span>VAULT</span>
          </div>
          <div className="theme-title-sub">Modo console</div>
        </div>
        <div className="cabinet-frame">
          <div className="frame-top-glow" />
          {selecionado === null ? (
            <div className="no-results" style={{ textAlign: 'center', padding: '3rem' }}>
              Nenhum jogo nesta coleção.
            </div>
          ) : (
            <>
              <section className="feature-area">
                <div className="feature-info">
                  <div className="feature-badge">
                    <span className="online-light" /> EM DESTAQUE <span>•</span>{' '}
                    {(selecionado.sistema ?? 'sistema não identificado').toUpperCase()}
                  </div>
                  <h1>{selecionado.titulo}</h1>
                  <div className="feature-meta">
                    <span>{selecionado.tamanho}</span>
                    <span>enviado em {selecionado.enviadoEm}</span>
                  </div>
                  <div className="feature-actions">
                    <button type="button" className="start-button" onClick={iniciarJogo}>
                      <Play size={15} fill="currentColor" /> INICIAR JOGO
                    </button>
                    <button
                      type="button"
                      className={`heart-button ${selecionado.favorito ? 'is-favorite' : ''}`}
                      onClick={alternarFavorito}
                    >
                      <Heart size={16} fill={selecionado.favorito ? 'currentColor' : 'none'} />{' '}
                      {selecionado.favorito ? 'FAVORITO' : 'FAVORITAR'}
                    </button>
                  </div>
                </div>
                <div className="preview-screen">
                  <div className="preview-header">
                    <span>PREVIEW / {String(indiceAtual + 1).padStart(2, '0')}</span>
                    <Gamepad2 size={15} />
                  </div>
                  {selecionado.capaUrl ? (
                    <img src={selecionado.capaUrl} alt="" />
                  ) : (
                    <div className="preview-screen-placeholder" />
                  )}
                  <div className="preview-overlay">
                    <span>{(selecionado.sistema ?? 'sistema não identificado').toUpperCase()}</span>
                    <strong>{selecionado.titulo}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="hero-arrow hero-arrow-left"
                  onClick={() => selecionarProximo(-1)}
                  aria-label="Jogo anterior"
                >
                  <ChevronLeft size={24} />
                </button>
                <button
                  type="button"
                  className="hero-arrow hero-arrow-right"
                  onClick={() => selecionarProximo(1)}
                  aria-label="Próximo jogo"
                >
                  <ChevronRight size={24} />
                </button>
              </section>
              <section className="library-strip">
                <div className="library-infinite-head">
                  <div>
                    <span className="rail-label">BIBLIOTECA</span>
                    <strong>{colecao}</strong>
                  </div>
                  <div className="joystick-hint">
                    <span className="dpad-icon">✦</span>
                    <span>←→</span> NAVEGAR <span className="hint-separator">•</span>{' '}
                    <span>ENTER</span> INICIAR
                  </div>
                </div>
                <div className="cover-marquee">
                  <div className="cover-track">
                    {visiveis.map((jogo) => (
                      <button
                        type="button"
                        key={jogo.id}
                        className={`cover-card ${jogo.id === selecionado.id ? 'selected' : ''}`}
                        onClick={() => setSelectedId(jogo.id)}
                      >
                        <div className="cover-image">
                          {jogo.capaUrl ? (
                            <img src={jogo.capaUrl} alt="" />
                          ) : (
                            <div className="cover-image-placeholder" />
                          )}
                          <span>{(jogo.sistema ?? '—').toUpperCase()}</span>
                        </div>
                        <strong>{jogo.titulo}</strong>
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </>
          )}
        </div>
        <div className="bottom-rail">
          <div>
            <span className="rail-label">COLEÇÃO ATUAL</span>
            <strong>{colecao}</strong>
          </div>
          <div className="rail-center">
            <button type="button" onClick={() => selecionarProximo(-1)} aria-label="Jogo anterior">
              <ChevronLeft size={15} />
            </button>
            <span>
              {String(indiceAtual + 1).padStart(2, '0')} /{' '}
              {String(filtrados.length).padStart(2, '0')}
            </span>
            <button type="button" onClick={() => selecionarProximo(1)} aria-label="Próximo jogo">
              <ChevronRight size={15} />
            </button>
          </div>
          <div className="rail-hint">
            ENTER <span>iniciar</span>
            <span>•</span> A / D <span>navegar</span>
          </div>
        </div>
      </main>
    </div>
  );
}
