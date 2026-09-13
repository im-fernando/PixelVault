import { useEffect, useRef, type ReactNode } from 'react';
import { ArrowLeft, Check, Moon, Sparkles, Sun, X } from 'lucide-react';
import { TEMAS, type PreferenciasConsole } from './temas.js';

export function moverFocoDoDialogo(direcao: number) {
  const botoes = Array.from(
    document.querySelectorAll<HTMLElement>('.cx-dialog button:not(:disabled), .cx-dialog input'),
  );
  if (botoes.length === 0) return false;
  const atual = botoes.indexOf(document.activeElement as HTMLElement);
  botoes[(Math.max(0, atual) + direcao + botoes.length) % botoes.length]?.focus();
  return document.activeElement !== botoes[atual];
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
            data-console-sound="voltar"
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

function Miniatura({
  tema,
  solsticeEscuro,
  auroraWhite,
}: Pick<PreferenciasConsole, 'tema' | 'solsticeEscuro' | 'auroraWhite'>) {
  return (
    <span
      className={`cx-theme-mini cx-mini-${tema}`}
      data-aurora-mode={auroraWhite ? 'white' : 'dark'}
      data-solstice-mode={solsticeEscuro ? 'dark' : 'light'}
      aria-hidden="true"
    >
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
  const aurora = preferencias.tema === 'aurora';
  const nomeDaAparencia = aurora ? 'Aurora' : 'Solstice';
  const claro = aurora ? preferencias.auroraWhite : !preferencias.solsticeEscuro;
  const alterarAparencia = (claro: boolean) =>
    alterar(aurora ? { auroraWhite: claro } : { solsticeEscuro: !claro });
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
            <Miniatura
              tema={tema.id}
              solsticeEscuro={preferencias.solsticeEscuro}
              auroraWhite={preferencias.auroraWhite}
            />
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
      {(aurora || preferencias.tema === 'solstice') && (
        <div className="cx-solstice-appearance">
          <div>
            <span className="cx-overline">A LUZ MUDA. SEU CONSOLE TAMBÉM.</span>
            <h3>Aparência do {nomeDaAparencia}</h3>
            <p>Da biblioteca à partida, no seu ritmo.</p>
          </div>
          <div
            className="cx-color-modes"
            role="group"
            aria-label={`Modo de cor do ${nomeDaAparencia}`}
          >
            <button type="button" aria-pressed={claro} onClick={() => alterarAparencia(true)}>
              <Sun size={18} aria-hidden="true" />
              {aurora ? 'White' : 'Claro'}
            </button>
            <button type="button" aria-pressed={!claro} onClick={() => alterarAparencia(false)}>
              <Moon size={18} aria-hidden="true" />
              Escuro
            </button>
          </div>
        </div>
      )}
      <div className="cx-preferences">
        {(
          [
            ['movimento', 'Animações', 'Movimento suave e transições entre jogos.'],
            ['ambiente', 'Efeitos de ambiente', 'Luz, órbitas e textura de tela do tema.'],
            ['sons', 'Sons da interface', 'Feedback suave ao navegar, digitar e confirmar.'],
          ] as const
        ).map(([chave, nome, descricao]) => (
          <button
            type="button"
            key={chave}
            className="cx-preference"
            role="switch"
            aria-checked={preferencias[chave]}
            aria-label={nome}
            data-console-sound={chave === 'sons' ? 'nenhum' : undefined}
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
        <button
          type="button"
          className="cx-dialog-return"
          onClick={fechar}
          data-console-sound="voltar"
        >
          <ArrowLeft size={16} />
          Voltar ao console
        </button>
      </footer>
    </ConsoleDialog>
  );
}
