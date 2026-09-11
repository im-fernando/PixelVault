import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Check, Sparkles, X } from 'lucide-react';
import { TEMAS, type PreferenciasConsole, type TemaConsole } from './temas.js';

export function moverFocoDoDialogo(direcao: number) {
  const botoes = Array.from(
    document.querySelectorAll<HTMLElement>('.cx-dialog button:not(:disabled), .cx-dialog input'),
  );
  if (botoes.length === 0) return;
  const atual = botoes.indexOf(document.activeElement as HTMLElement);
  botoes[(Math.max(0, atual) + direcao + botoes.length) % botoes.length]?.focus();
}

export function ConsoleDialog({
  titulo,
  fechar,
  children,
  amplo = false,
}: {
  titulo: string;
  fechar: () => void;
  children: ReactNode;
  amplo?: boolean;
}) {
  const painel = useRef<HTMLElement>(null);
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (painel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? painel.current)?.focus();
    const prenderFoco = (evento: KeyboardEvent) => {
      if (evento.key !== 'Tab') return;
      const elementos = Array.from(
        painel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input') ?? [],
      );
      const primeiro = elementos[0];
      const ultimo = elementos.at(-1);
      if (
        evento.shiftKey &&
        (document.activeElement === primeiro || document.activeElement === painel.current)
      ) {
        evento.preventDefault();
        ultimo?.focus();
      } else if (
        !evento.shiftKey &&
        (document.activeElement === ultimo || document.activeElement === painel.current)
      ) {
        evento.preventDefault();
        primeiro?.focus();
      }
    };
    window.addEventListener('keydown', prenderFoco);
    return () => {
      document.body.style.overflow = overflowAnterior;
      window.removeEventListener('keydown', prenderFoco);
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);
  return (
    <div className="cx-overlay">
      <div className="cx-dialog-backdrop" onClick={fechar} aria-hidden="true" />
      <section
        ref={painel}
        className={`cx-dialog ${amplo ? 'cx-dialog-wide' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
      >
        <header className="cx-dialog-header">
          <div>
            <span className="cx-overline">PERSONALIZE SEU CONSOLE</span>
            <h2>{titulo}</h2>
          </div>
          <button
            type="button"
            className="cx-icon-button"
            onClick={fechar}
            aria-label={`Fechar ${titulo.toLowerCase()}`}
          >
            <X size={22} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}

function Miniatura({ tema }: { tema: TemaConsole }) {
  return (
    <span className={`cx-theme-mini cx-mini-${tema}`} aria-hidden="true">
      <span className="cx-mini-top">
        <b>PV</b>
        <i />
        <i />
        <i />
      </span>
      <span className="cx-mini-library">
        {[0, 1, 2, 3, 4].map((i) => (
          <i key={i} />
        ))}
      </span>
      <span className="cx-mini-title">
        <b>{tema === 'crt' ? 'PIXEL_' : 'Seu próximo mundo.'}</b>
        <i />
        <em />
      </span>
      <span className="cx-mini-sculpture">
        <i />
        <b>PV</b>
      </span>
      <span className="cx-mini-bottom">
        <i />
        <i />
        <i />
      </span>
    </span>
  );
}

export function ConfiguracoesConsole({
  preferencias,
  alterar,
  fechar,
  persistido,
}: {
  preferencias: PreferenciasConsole;
  alterar: (patch: Partial<PreferenciasConsole>) => void;
  fechar: () => void;
  persistido: boolean;
}) {
  return (
    <ConsoleDialog titulo="Seu console. Seu estilo." fechar={fechar} amplo>
      <p className="cx-dialog-description">
        Quatro maneiras de entrar no jogo. Escolha uma experiência completa.
      </p>
      <div className="cx-theme-gallery" role="group" aria-label="Temas do modo console">
        {TEMAS.map((tema) => (
          <button
            type="button"
            key={tema.id}
            className="cx-theme-choice"
            onClick={() => alterar({ tema: tema.id })}
            aria-pressed={preferencias.tema === tema.id}
            aria-label={`Tema ${tema.nome}`}
            data-autofocus={preferencias.tema === tema.id ? '' : undefined}
          >
            <Miniatura tema={tema.id} />
            <span className="cx-theme-description">
              <span>
                <strong>{tema.nome}</strong>
                <small>{tema.estilo}</small>
              </span>
              <span className="cx-theme-radio">
                {preferencias.tema === tema.id && <Check size={16} />}
              </span>
            </span>
            <span className="cx-theme-caption">{tema.descricao}</span>
          </button>
        ))}
      </div>
      <div className="cx-preferences">
        {(
          [
            ['movimento', 'Animações', 'Movimento suave e transições entre jogos.'],
            ['ambiente', 'Efeitos de ambiente', 'Luz, órbitas e textura de tela do tema.'],
          ] as const
        ).map(([chave, nome, descricao]) => (
          <button
            type="button"
            key={chave}
            className="cx-preference"
            role="switch"
            aria-checked={preferencias[chave]}
            aria-label={nome}
            onClick={() => alterar({ [chave]: !preferencias[chave] })}
          >
            <span>
              <b>{nome}</b>
              <small>{descricao}</small>
            </span>
            <span className="cx-switch">
              <i />
            </span>
          </button>
        ))}
      </div>
      <footer className="cx-dialog-footer">
        <span role="status">
          <Sparkles size={15} />
          {persistido
            ? 'Aplicado ao console · salvo neste navegador'
            : 'Aplicado nesta sessão · armazenamento indisponível'}
        </span>
        <button type="button" className="cx-dialog-return" onClick={fechar}>
          <ArrowLeft size={16} />
          Voltar ao console
        </button>
      </footer>
    </ConsoleDialog>
  );
}
