import { useEffect, useState, type CSSProperties } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, Gamepad2, Heart, Play } from 'lucide-react';
import { matizDoJogo, type ItemDoConsole, type TemaConsole } from './temas.js';

export type PropsDoTema = {
  selecionado: ItemDoConsole;
  jogos: readonly ItemDoConsole[];
  indice: number;
  total: number;
  colecao: string;
  selecionar: (id: string) => void;
  mover: (direcao: number) => void;
  iniciar: () => void;
  favoritar: () => void;
  favoritando: boolean;
};

export function Capa({ jogo, className = '' }: { jogo: ItemDoConsole; className?: string }) {
  const [falhou, setFalhou] = useState<string | null>(null);
  return (
    <div
      className={`cx-art ${className}`}
      style={{ '--game-hue': matizDoJogo(jogo.titulo) } as CSSProperties}
      aria-hidden="true"
    >
      <div className="cx-art-fallback">
        <span>{jogo.sistema ?? 'PIXELVAULT'}</span>
        <Gamepad2 strokeWidth={1} />
        <strong>{jogo.titulo}</strong>
        <small>PLAYER ONE</small>
      </div>
      {jogo.capaUrl && falhou !== jogo.capaUrl && (
        <>
          <img className="cx-art-backfill" src={jogo.capaUrl} alt="" draggable={false} />
          <img
            src={jogo.capaUrl}
            alt=""
            draggable={false}
            onError={() => setFalhou(jogo.capaUrl)}
          />
        </>
      )}
    </div>
  );
}

function Acoes(props: PropsDoTema) {
  return (
    <div className="cx-game-actions">
      <button
        type="button"
        className="cx-play"
        onClick={props.iniciar}
        data-console-sound="iniciar"
      >
        <Play size={18} fill="currentColor" /> <span>Iniciar jogo</span>
        <kbd>↵</kbd>
      </button>
      <button
        type="button"
        className="cx-favorite"
        onClick={props.favoritar}
        disabled={props.favoritando}
        aria-label={props.selecionado.favorito ? 'FAVORITO' : 'FAVORITAR'}
        aria-pressed={props.selecionado.favorito}
      >
        <Heart size={20} fill={props.selecionado.favorito ? 'currentColor' : 'none'} />
      </button>
    </div>
  );
}

function Informacoes(props: PropsDoTema) {
  return (
    <div className="cx-game-info" key={props.selecionado.id}>
      <p className="cx-game-system">
        <span />
        <span className="cx-system-name">
          {props.selecionado.sistema ?? 'Sistema não identificado'}
        </span>
        <i />
        Sua biblioteca
      </p>
      <h1>{props.selecionado.titulo}</h1>
      <p className="cx-game-details">
        {props.selecionado.tamanho}
        <span>·</span>
        {props.selecionado.favorito ? 'Entre os seus favoritos' : 'Pronto para jogar'}
      </p>
      <Acoes {...props} />
    </div>
  );
}

function Paginacao({ indice, total, mover }: PropsDoTema) {
  return (
    <div className="cx-pagination">
      <button
        type="button"
        aria-label="Jogo anterior"
        data-console-sound="navegar"
        onClick={() => mover(-1)}
        disabled={total < 2}
      >
        <ChevronLeft size={19} />
      </button>
      <span>
        <b>{String(indice + 1).padStart(2, '0')}</b> / {String(total).padStart(2, '0')}
      </span>
      <button
        type="button"
        aria-label="Próximo jogo"
        data-console-sound="navegar"
        onClick={() => mover(1)}
        disabled={total < 2}
      >
        <ChevronRight size={19} />
      </button>
    </div>
  );
}

function Trilho(props: PropsDoTema) {
  return (
    <div className="cx-game-rail" role="group" aria-label="Jogos da coleção">
      {props.jogos.map((jogo) => (
        <button
          key={jogo.id}
          type="button"
          className={`cx-game-tile ${props.selecionado.id === jogo.id ? 'is-selected' : ''}`}
          aria-label={`Selecionar ${jogo.titulo}`}
          data-console-sound="navegar"
          aria-pressed={props.selecionado.id === jogo.id}
          onClick={() => props.selecionar(jogo.id)}
          onDoubleClick={jogo.id === props.selecionado.id ? props.iniciar : undefined}
        >
          <Capa jogo={jogo} />
          <span>{jogo.titulo}</span>
          {jogo.favorito && <Heart className="cx-tile-heart" size={12} fill="currentColor" />}
        </button>
      ))}
    </div>
  );
}

function Aurora(props: PropsDoTema) {
  return (
    <main className="cx-aurora-layout" data-console-layout="aurora">
      <section className="cx-aurora-library" aria-label="Biblioteca">
        <div className="cx-section-line">
          <span>{props.colecao}</span>
          <span>{props.total} jogos para explorar</span>
        </div>
        <Trilho {...props} />
      </section>
      <section className="cx-aurora-stage" aria-label="Jogo selecionado">
        <Informacoes {...props} />
        <div className="cx-aurora-sculpture" aria-hidden="true">
          <div className="cx-orbit cx-orbit-one" />
          <div className="cx-orbit cx-orbit-two" />
          <div className="cx-aurora-case" key={props.selecionado.id}>
            <Capa jogo={props.selecionado} />
          </div>
          <span className="cx-orbit-caption">UM NOVO UNIVERSO. A CADA PLAY.</span>
        </div>
      </section>
      <div className="cx-scene-bottom">
        <span>
          AURORA <i /> Entre no seu universo.
        </span>
        <Paginacao {...props} />
      </div>
    </main>
  );
}

function Obsidian(props: PropsDoTema) {
  const indiceVisivel = props.jogos.findIndex((jogo) => jogo.id === props.selecionado.id);
  return (
    <main className="cx-obsidian-layout" data-console-layout="obsidian">
      <aside className="cx-obsidian-library" aria-label="Biblioteca">
        <p className="cx-overline">SUA COLEÇÃO / {String(props.total).padStart(2, '0')}</p>
        <h2>Em cena.</h2>
        <div className="cx-obsidian-list">
          {props.jogos.map((jogo, index) => (
            <button
              key={jogo.id}
              type="button"
              onClick={() => props.selecionar(jogo.id)}
              className={jogo.id === props.selecionado.id ? 'is-selected' : ''}
              aria-pressed={jogo.id === props.selecionado.id}
              aria-label={`Selecionar ${jogo.titulo}`}
              data-console-sound="navegar"
            >
              <span className="cx-list-index">
                {String(
                  ((props.indice + index - indiceVisivel + props.total) % props.total) + 1,
                ).padStart(2, '0')}
              </span>
              <Capa jogo={jogo} />
              <span className="cx-list-copy">
                <b>{jogo.titulo}</b>
                <small>{jogo.sistema ?? 'Biblioteca'}</small>
              </span>
              <ArrowUpRight size={16} />
            </button>
          ))}
        </div>
        <div className="cx-obsidian-library-bottom">
          <span>OBSIDIAN</span>
          <span>O próximo ato é seu.</span>
        </div>
      </aside>
      <section className="cx-obsidian-stage" aria-label="Jogo selecionado">
        <div className="cx-obsidian-backdrop" key={props.selecionado.id}>
          <Capa jogo={props.selecionado} />
        </div>
        <div className="cx-obsidian-topline">
          <span>AGORA EM DESTAQUE</span>
          <span>{props.selecionado.sistema ?? 'PIXELVAULT'}</span>
        </div>
        <span className="cx-cinema-number" aria-hidden="true">
          {String(props.indice + 1).padStart(2, '0')}
        </span>
        <Informacoes {...props} />
        <div className="cx-obsidian-bottom">
          <span>SEUS JOGOS. EM PRIMEIRO PLANO.</span>
          <Paginacao {...props} />
        </div>
      </section>
    </main>
  );
}

function Solstice(props: PropsDoTema) {
  const centro = props.jogos.findIndex((jogo) => jogo.id === props.selecionado.id);
  return (
    <main className="cx-solstice-layout" data-console-layout="solstice">
      <div className="cx-solstice-heading">
        <span className="cx-overline">SOLSTICE / SUA BIBLIOTECA</span>
        <h2>Hora de jogar.</h2>
        <p>Escolha um mundo. Fique à vontade.</p>
      </div>
      <section className="cx-solstice-stage" aria-label="Jogos da coleção">
        <div className="cx-solstice-sun" aria-hidden="true" />
        {props.jogos.map((jogo, index) => {
          let distancia = index - centro;
          if (distancia > props.jogos.length / 2) distancia -= props.jogos.length;
          if (distancia < -props.jogos.length / 2) distancia += props.jogos.length;
          if (Math.abs(distancia) > 2) return null;
          return (
            <button
              key={jogo.id}
              type="button"
              className={`cx-floating-case ${distancia === 0 ? 'is-selected' : ''}`}
              style={{ '--offset': distancia, '--distance': Math.abs(distancia) } as CSSProperties}
              onClick={() => props.selecionar(jogo.id)}
              aria-label={`Selecionar ${jogo.titulo}`}
              data-console-sound="navegar"
              aria-pressed={distancia === 0}
            >
              <Capa jogo={jogo} />
              <span>{jogo.sistema ?? 'PIXELVAULT'}</span>
            </button>
          );
        })}
      </section>
      <section className="cx-solstice-selection" aria-label="Jogo selecionado">
        <Informacoes {...props} />
      </section>
      <div className="cx-scene-bottom">
        <span>
          {props.colecao} <i /> {props.total} jogos
        </span>
        <Paginacao {...props} />
      </div>
    </main>
  );
}

function Crt(props: PropsDoTema) {
  return (
    <main className="cx-crt-layout" data-console-layout="crt">
      <div className="cx-crt-marquee">
        <h2>
          PIXEL<span>VAULT</span>
          <span className="cx-cursor">_</span>
        </h2>
        <span>ENTERTAINMENT SYSTEM</span>
      </div>
      <div className="cx-crt-cabinet">
        <section className="cx-crt-stage" aria-label="Jogo selecionado">
          <div>
            <p className="cx-crt-signal">
              ● SINAL ATIVO / {props.selecionado.sistema ?? 'BIBLIOTECA'}
            </p>
            <Informacoes {...props} />
          </div>
          <div className="cx-crt-screen">
            <Capa jogo={props.selecionado} />
            <span>PLAYER 1 · {String(props.indice + 1).padStart(2, '0')}</span>
          </div>
        </section>
        <section className="cx-crt-library" aria-label="Biblioteca">
          <div className="cx-section-line">
            <span>{props.colecao}</span>
            <span>SELECIONE SEU CARTUCHO</span>
          </div>
          <Trilho {...props} />
        </section>
      </div>
      <div className="cx-scene-bottom">
        <span>
          MEMÓRIA: {props.total} JOGOS <i /> SISTEMA PRONTO
        </span>
        <Paginacao {...props} />
      </div>
    </main>
  );
}

const LAYOUTS = { aurora: Aurora, obsidian: Obsidian, solstice: Solstice, crt: Crt };

export function ConsoleTheme({ tema, ...props }: PropsDoTema & { tema: TemaConsole }) {
  useEffect(() => {
    // Rolamos somente o trilho: scrollIntoView também moveria a página no celular.
    const manterVisivel = () => {
      const trilho = document.querySelector<HTMLElement>(
        '.console-experience .cx-game-rail, .console-experience .cx-obsidian-list',
      );
      const ativo = trilho?.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!trilho || !ativo) return;
      const area = trilho.getBoundingClientRect();
      const jogo = ativo.getBoundingClientRect();
      if (jogo.right > area.right - 8) trilho.scrollLeft += jogo.right - area.right + 8;
      else if (jogo.left < area.left + 8) trilho.scrollLeft -= area.left - jogo.left + 8;
    };
    manterVisivel();
    window.addEventListener('resize', manterVisivel);
    return () => window.removeEventListener('resize', manterVisivel);
  }, [tema, props.selecionado.id]);
  const Layout = LAYOUTS[tema];
  return <Layout {...props} />;
}
