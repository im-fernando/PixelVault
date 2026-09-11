import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Gamepad2,
  Grid2X2,
  Maximize,
  Minimize,
  Search,
  Settings2,
  Volume2,
} from 'lucide-react';
import type { LibraryRom, SystemId } from '@pixelvault/contracts';
import { useBiblioteca, useFavoritarRom } from '../library/use-biblioteca.js';
import { ConsoleTheme } from './ConsoleThemes.js';
import { ConfiguracoesConsole, ConsoleDialog, moverFocoDoDialogo } from './ConsoleDialog.js';
import {
  lerPreferencias,
  salvarPreferencias,
  type ItemDoConsole,
  type PreferenciasConsole,
} from './temas.js';
import './console.css';
import { entrarEmTelaCheiaDoConsole } from './tela-cheia.js';
import { ConsoleSearchKeyboard } from './ConsoleSearchKeyboard.js';
import {
  criarRepeticaoDoDirecional,
  focarPrimeiraTecla,
  moverFocoDaBusca,
  type DirecaoDoTeclado,
} from './teclado-do-console.js';
import { useSonsDoConsole } from './use-sons-do-console.js';

const TODOS = 'TODOS OS JOGOS';
const FAVORITOS = 'FAVORITOS';
type Painel = 'settings' | 'search' | 'collections' | null;
const DIRECOES: Readonly<Record<string, DirecaoDoTeclado | undefined>> = {
  arrowleft: 'left',
  arrowright: 'right',
  arrowup: 'up',
  arrowdown: 'down',
};

function paraItem(rom: LibraryRom): ItemDoConsole {
  const bytes = rom.sizeBytes;
  return {
    id: rom.id,
    titulo: rom.title,
    sistema: rom.systemId,
    capaUrl: rom.coverUrl,
    favorito: rom.isFavorite,
    tamanho:
      bytes < 1024
        ? `${bytes} B`
        : bytes < 1024 * 1024
          ? `${(bytes / 1024).toFixed(1)} KB`
          : `${(bytes / 1024 / 1024).toFixed(1)} MB`,
  };
}

export function ConsolePage({ jogoInicial }: { jogoInicial?: string | undefined } = {}) {
  const biblioteca = useBiblioteca();
  const favoritar = useFavoritarRom();
  const navigate = useNavigate();
  const raiz = useRef<HTMLDivElement>(null);
  const anteriores = useRef<boolean[]>([]);
  const [preferencias, setPreferencias] = useState(lerPreferencias);
  const [persistido, setPersistido] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(jogoInicial ?? null);
  const [colecao, setColecao] = useState(TODOS);
  const [query, setQuery] = useState('');
  const [painel, definirPainel] = useState<Painel>(null);
  const [buscaPeloControle, setBuscaPeloControle] = useState(false);
  const repeticao = useRef(criarRepeticaoDoDirecional());
  const consultarControle = useRef<() => void>(() => undefined);
  const sons = useSonsDoConsole(preferencias);
  const [aviso, setAviso] = useState<string | null>(null);
  const [hora, setHora] = useState(() => new Date());
  const [controleConectado, setControleConectado] = useState(false);
  const [telaCheia, setTelaCheia] = useState(false);
  const jogos = useMemo(() => (biblioteca.data ?? []).map(paraItem), [biblioteca.data]);
  const colecoes = useMemo(
    () => [
      TODOS,
      FAVORITOS,
      ...Array.from(
        new Set(jogos.map((jogo) => jogo.sistema).filter((s): s is SystemId => s !== null)),
      )
        .sort()
        .map((s) => s.toUpperCase()),
    ],
    [jogos],
  );
  const filtrados = useMemo(
    () =>
      jogos.filter(
        (jogo) =>
          jogo.titulo.toLocaleLowerCase().includes(query.toLocaleLowerCase()) &&
          (colecao === TODOS ||
            (colecao === FAVORITOS ? jogo.favorito : jogo.sistema?.toUpperCase() === colecao)),
      ),
    [jogos, colecao, query],
  );
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
          (_, i) => filtrados[(indiceAtual + i - 2 + filtrados.length) % filtrados.length]!,
        );

  useEffect(() => {
    setPersistido(salvarPreferencias(preferencias));
  }, [preferencias]);
  useEffect(() => {
    const atualizarTela = () => setTelaCheia(document.fullscreenElement !== null);
    const intervalo = window.setInterval(() => setHora(new Date()), 30_000);
    document.addEventListener('fullscreenchange', atualizarTela);
    return () => {
      window.clearInterval(intervalo);
      document.removeEventListener('fullscreenchange', atualizarTela);
    };
  }, []);
  useEffect(() => {
    if (aviso === null) return;
    const timeout = window.setTimeout(() => setAviso(null), 2800);
    return () => window.clearTimeout(timeout);
  }, [aviso]);

  const alterarPreferencias = (patch: Partial<PreferenciasConsole>) =>
    setPreferencias((atual) => ({ ...atual, ...patch }));
  const setPainel = (proximo: Painel, peloControle = false) => {
    if (proximo !== painel) sons.tocar(proximo === null ? 'voltar' : 'abrir');
    if (proximo === 'search') setBuscaPeloControle(peloControle);
    definirPainel(proximo);
  };
  const navegarNoPainel = (direcao: DirecaoDoTeclado) => {
    const mudou =
      painel === 'search'
        ? moverFocoDaBusca(direcao)
        : moverFocoDoDialogo(direcao === 'left' || direcao === 'up' ? -1 : 1);
    if (mudou) sons.tocar('navegar');
  };
  const selecionarProximo = (direcao: number) => {
    if (filtrados.length > 1) {
      sons.tocar('navegar');
      setSelectedId(filtrados[(indiceAtual + direcao + filtrados.length) % filtrados.length]!.id);
    }
  };
  const iniciarJogo = () => {
    if (!selecionado) return;
    sons.tocar('iniciar');
    void entrarEmTelaCheiaDoConsole().then(() =>
      navigate({ to: '/console/$romId', params: { romId: selecionado.id } }),
    );
  };
  const alternarFavorito = () => {
    if (!selecionado || favoritar.isPending) return;
    sons.tocar('confirmar');
    favoritar.mutate(
      { romId: selecionado.id, favorito: !selecionado.favorito },
      {
        onSuccess: () =>
          setAviso(selecionado.favorito ? 'Removido dos favoritos' : 'Adicionado aos favoritos'),
        onError: () => setAviso('Não foi possível atualizar os favoritos. Tente novamente.'),
      },
    );
  };
  const alternarTelaCheia = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (!(await entrarEmTelaCheiaDoConsole()))
        setAviso('Não foi possível ativar a tela cheia.');
    } catch {
      setAviso('Não foi possível ativar a tela cheia.');
    }
  };
  const digitar = (tecla: string) => {
    sons.tocar('digitar');
    setQuery((valor) => `${valor}${tecla}`.slice(0, 28));
  };

  // O painel ativo recebe o input com exclusividade, inclusive o botão A do
  // controle. Uma troca de tema nunca pode iniciar o jogo atrás do diálogo.
  useEffect(() => {
    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.altKey || evento.ctrlKey || evento.metaKey) return;
      const tecla = evento.key.toLowerCase();
      if (tecla === 'escape') {
        evento.preventDefault();
        setPainel(null);
        return;
      }
      if (painel !== null) {
        if (painel === 'search') {
          const direcao = DIRECOES[tecla];
          if (evento.target instanceof HTMLInputElement) {
            if (tecla === 'enter') {
              evento.preventDefault();
              sons.tocar('confirmar');
              setPainel(null);
            } else if (tecla === 'arrowdown') {
              evento.preventDefault();
              navegarNoPainel('down');
            }
            return;
          }
          if (direcao) {
            evento.preventDefault();
            navegarNoPainel(direcao);
          } else if (
            (tecla === 'enter' || tecla === ' ') &&
            document.activeElement instanceof HTMLElement &&
            document.activeElement.matches('[data-console-key]')
          ) {
            evento.preventDefault();
            if (!evento.repeat) document.activeElement.click();
          } else if (tecla === 'backspace') {
            evento.preventDefault();
            sons.tocar('apagar');
            setQuery((atual) => atual.slice(0, -1));
          }
          return;
        }
        if (evento.target instanceof HTMLInputElement) {
          if (tecla === 'enter') {
            evento.preventDefault();
            setPainel(null);
          }
          return;
        }
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown'].includes(tecla)) {
          evento.preventDefault();
          navegarNoPainel(tecla.slice(5) as DirecaoDoTeclado);
        }
        return;
      }
      if (tecla === '/' || tecla === 'f2') {
        evento.preventDefault();
        setPainel(tecla === '/' ? 'search' : 'settings');
        return;
      }
      if (evento.target instanceof HTMLButtonElement && (tecla === 'enter' || tecla === ' '))
        return;
      if (tecla === 'arrowleft' || tecla === 'a') {
        evento.preventDefault();
        selecionarProximo(-1);
      }
      if (tecla === 'arrowright' || tecla === 'd') {
        evento.preventDefault();
        selecionarProximo(1);
      }
      if (['arrowup', 'arrowdown', 'w', 's'].includes(tecla)) {
        evento.preventDefault();
        if (preferencias.tema === 'obsidian')
          selecionarProximo(tecla === 'arrowup' || tecla === 'w' ? -1 : 1);
        else setPainel('collections');
      }
      if (tecla === 'enter') {
        evento.preventDefault();
        iniciarJogo();
      }
      if (tecla === 'f') alternarFavorito();
    };
    window.addEventListener('keydown', aoTeclar);
    return () => window.removeEventListener('keydown', aoTeclar);
  });

  consultarControle.current = () => {
    if (document.visibilityState === 'hidden') {
      anteriores.current = [];
      repeticao.current(null, 0);
      return;
    }
    const controle = Array.from(navigator.getGamepads?.() ?? []).find((pad) => pad?.connected);
    setControleConectado(Boolean(controle));
    if (!controle) {
      anteriores.current = [];
      repeticao.current(null, 0);
      return;
    }
    const botoes = controle.buttons.map((botao) => botao.pressed);
    // Eixos têm suas próprias bordas; mover o analógico não depende de A.
    botoes[12] = Boolean(botoes[12]) || (controle.axes[1] ?? 0) < -0.55;
    botoes[13] = Boolean(botoes[13]) || (controle.axes[1] ?? 0) > 0.55;
    botoes[14] = Boolean(botoes[14]) || (controle.axes[0] ?? 0) < -0.55;
    botoes[15] = Boolean(botoes[15]) || (controle.axes[0] ?? 0) > 0.55;
    const novo = (i: number) => botoes[i] === true && anteriores.current[i] !== true;
    const esquerda = novo(14);
    const direita = novo(15);
    const cima = novo(12);
    const baixo = novo(13);
    const direcaoSegurada = botoes[12]
      ? 'up'
      : botoes[13]
        ? 'down'
        : botoes[14]
          ? 'left'
          : botoes[15]
            ? 'right'
            : null;
    const repetir = repeticao.current(
      painel === 'search' ? direcaoSegurada : null,
      performance.now(),
    );
    if (painel === 'search') {
      if (novo(1)) setPainel(null);
      else if (novo(9)) {
        sons.tocar('confirmar');
        setPainel(null);
      } else if (novo(2)) {
        sons.tocar('apagar');
        setQuery((atual) => atual.slice(0, -1));
      } else if (novo(3)) digitar(' ');
      else if (repetir) navegarNoPainel(repetir);
      else if (novo(0)) {
        if (
          document.activeElement instanceof HTMLElement &&
          document.activeElement.closest('.cx-dialog') &&
          !(document.activeElement instanceof HTMLInputElement)
        )
          document.activeElement.click();
        else if (focarPrimeiraTecla()) sons.tocar('navegar');
      }
    } else if (painel) {
      if (novo(1) || novo(9)) setPainel(null);
      else if (esquerda || cima) navegarNoPainel(esquerda ? 'left' : 'up');
      else if (direita || baixo) navegarNoPainel(direita ? 'right' : 'down');
      else if (
        novo(0) &&
        document.activeElement instanceof HTMLElement &&
        document.activeElement.closest('.cx-dialog')
      ) {
        if (document.activeElement instanceof HTMLInputElement) setPainel(null);
        else document.activeElement.click();
      }
    } else {
      if (novo(9)) setPainel('settings');
      else if (novo(3)) setPainel('search', true);
      else if (novo(4) || novo(5)) setPainel('collections');
      else if (esquerda || (cima && preferencias.tema === 'obsidian')) selecionarProximo(-1);
      else if (direita || (baixo && preferencias.tema === 'obsidian')) selecionarProximo(1);
      else if (cima || baixo) setPainel('collections');
      else if (novo(2)) alternarFavorito();
      else if (novo(0)) iniciarJogo();
    }
    anteriores.current = botoes;
  };
  useEffect(() => {
    const intervalo = window.setInterval(() => consultarControle.current(), 40);
    return () => window.clearInterval(intervalo);
  }, []);

  return (
    <div
      ref={raiz}
      className="console-experience"
      data-console-theme={preferencias.tema}
      data-solstice-mode={preferencias.solsticeEscuro ? 'dark' : 'light'}
      data-motion={preferencias.movimento}
      data-ambient={preferencias.ambiente}
      onClickCapture={sons.aoClicar}
      onKeyDownCapture={(evento) => {
        if (evento.key === 'Tab') sons.tocar('navegar');
      }}
    >
      <div className="cx-atmosphere" aria-hidden="true">
        <div />
        <i />
        <b />
      </div>
      <div className="cx-chrome" inert={painel !== null}>
        <header className="cx-header">
          <div className="cx-brand">
            <span className="cx-brand-mark">
              p<span>v</span>
            </span>
            <span>
              PIXELVAULT<small>PLAY YOUR WAY</small>
            </span>
          </div>
          <nav className="cx-main-nav" aria-label="Modo console">
            <button
              type="button"
              className="is-active"
              onClick={() => {
                setColecao(TODOS);
                setQuery('');
              }}
            >
              Jogos
            </button>
            <button
              type="button"
              onClick={() => setPainel('collections')}
              aria-label="Menu"
              data-console-sound="abrir"
            >
              <Grid2X2 size={16} />
              <span>Coleções</span>
            </button>
          </nav>
          <div className="cx-system-actions">
            <button
              type="button"
              className="cx-icon-button"
              onClick={() => setPainel('search')}
              aria-label="Buscar"
              data-console-sound="abrir"
            >
              <Search size={21} />
            </button>
            <button
              type="button"
              className="cx-icon-button"
              onClick={() => setPainel('settings')}
              aria-label="Configurações"
              data-console-sound="abrir"
            >
              <Settings2 size={21} />
            </button>
            <button
              type="button"
              className="cx-icon-button cx-fullscreen-button"
              onClick={() => void alternarTelaCheia()}
              aria-label={telaCheia ? 'Sair da tela cheia' : 'Tela cheia'}
            >
              {telaCheia ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
            <time className="cx-clock" dateTime={hora.toISOString()}>
              {hora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </time>
          </div>
        </header>
        {query && (
          <button type="button" className="cx-active-search" onClick={() => setQuery('')}>
            Busca: “{query}” <span>Limpar ×</span>
          </button>
        )}
        {biblioteca.isPending ? (
          <main className="cx-empty" data-testid="modo-console-carregando" role="status">
            <span className="cx-loading-orbit" />
            <p className="cx-overline">PIXELVAULT</p>
            <h1>Preparando seus mundos.</h1>
            <p>Carregando biblioteca…</p>
          </main>
        ) : biblioteca.isError ? (
          <main className="cx-empty" role="alert">
            <Gamepad2 size={48} />
            <h1>A biblioteca não respondeu.</h1>
            <p>Verifique sua conexão e tente novamente.</p>
            <button type="button" className="cx-play" onClick={() => void biblioteca.refetch()}>
              Tentar novamente
            </button>
          </main>
        ) : selecionado ? (
          <ConsoleTheme
            tema={preferencias.tema}
            selecionado={selecionado}
            jogos={visiveis}
            indice={indiceAtual}
            total={filtrados.length}
            colecao={colecao}
            selecionar={setSelectedId}
            mover={selecionarProximo}
            iniciar={iniciarJogo}
            favoritar={alternarFavorito}
            favoritando={favoritar.isPending}
          />
        ) : (
          <main className="cx-empty">
            <Gamepad2 size={48} />
            <h1>
              {jogos.length ? 'Nenhum jogo nesta coleção.' : 'Seu próximo mundo começa aqui.'}
            </h1>
            <p>
              {jogos.length
                ? 'Experimente outra coleção ou limpe a busca.'
                : 'Sua biblioteca está vazia. Envie uma ROM para jogar por aqui.'}
            </p>
            <button
              type="button"
              className="cx-play"
              onClick={() => {
                if (jogos.length) {
                  setQuery('');
                  setColecao(TODOS);
                } else void navigate({ to: '/enviar-rom' });
              }}
            >
              {jogos.length ? 'Ver todos os jogos' : 'Adicionar meu primeiro jogo'}
              <ChevronRight size={18} />
            </button>
          </main>
        )}
        <footer className="cx-footer">
          <div className="cx-controller-status">
            <Gamepad2 size={18} />
            <span>{controleConectado ? 'Controle conectado' : 'Teclado e mouse'}</span>
          </div>
          <div className="cx-input-hints">
            <span>
              <kbd>{controleConectado ? '✚' : '← →'}</kbd>Navegar
            </span>
            <span>
              <kbd>{controleConectado ? 'A' : '↵'}</kbd>Jogar
            </span>
            <span>
              <kbd>{controleConectado ? 'X' : 'F'}</kbd>Favorito
            </span>
            <button type="button" onClick={() => setPainel('settings')}>
              <kbd>{controleConectado ? '☰' : 'F2'}</kbd>Temas
            </button>
          </div>
          <button type="button" className="cx-exit" onClick={() => void navigate({ to: '/' })}>
            <ArrowLeft size={15} />
            <span>Sair do console</span>
          </button>
        </footer>
      </div>
      {painel === 'settings' && (
        <ConfiguracoesConsole
          preferencias={preferencias}
          alterar={alterarPreferencias}
          fechar={() => setPainel(null)}
          persistido={persistido}
        />
      )}
      {painel === 'collections' && (
        <ConsoleDialog titulo="Coleções" fechar={() => setPainel(null)}>
          <p className="cx-dialog-description">
            Encontre seu próximo jogo por sistema ou pelos favoritos.
          </p>
          <div className="cx-collections">
            {colecoes.map((item) => (
              <button
                key={item}
                type="button"
                data-autofocus={item === colecao ? '' : undefined}
                aria-pressed={item === colecao}
                onClick={() => {
                  setColecao(item);
                  setPainel(null);
                }}
              >
                <Gamepad2 size={20} />
                <span>{item}</span>
                {item === colecao ? <Check size={17} /> : <ChevronRight size={17} />}
              </button>
            ))}
          </div>
        </ConsoleDialog>
      )}
      {painel === 'search' && (
        <ConsoleDialog titulo="Pesquisar jogos" fechar={() => setPainel(null)}>
          <ConsoleSearchKeyboard
            query={query}
            alterar={setQuery}
            digitar={digitar}
            concluir={() => setPainel(null)}
            resultados={filtrados.length}
            colecao={colecao}
            controle={buscaPeloControle}
          />
        </ConsoleDialog>
      )}
      {sons.bloqueado && (
        <button
          type="button"
          className="cx-audio-unlock"
          data-console-sound="nenhum"
          onClick={() => sons.tocar('confirmar')}
        >
          <Volume2 size={16} />
          Ativar sons da interface
        </button>
      )}
      {aviso && (
        <div className="cx-toast" role="status">
          <Check size={16} />
          {aviso}
        </div>
      )}
    </div>
  );
}
