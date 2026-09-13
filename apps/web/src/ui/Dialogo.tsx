import { X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { BotaoIcone } from './Botao.js';

/**
 * O diálogo do site, no desenho do console: fundo desfocado, painel de canto
 * largo, sobrelinha em cima do título.
 *
 * Só o clique que COMEÇA no fundo fecha. Sem isto, arrastar uma seleção de
 * texto de dentro para fora fecharia o diálogo no soltar. `Escape` fecha
 * sempre. O foco inicial é de quem monta (`data-autofocus`), porque num
 * diálogo destrutivo a tecla apertada por reflexo não pode ser a que apaga.
 */
export function Dialogo({
  titulo,
  sobrelinha,
  fechar,
  rotuloDeFechar = 'Fechar',
  children,
}: {
  readonly titulo: string;
  readonly sobrelinha?: string | undefined;
  readonly fechar: () => void;
  readonly rotuloDeFechar?: string;
  readonly children: ReactNode;
}) {
  const painel = useRef<HTMLElement>(null);
  const idDoTitulo = useId();
  const fecharAtual = useRef(fechar);
  fecharAtual.current = fechar;

  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    (painel.current?.querySelector<HTMLElement>('[data-autofocus]') ?? painel.current)?.focus();
    function aoTeclar(evento: KeyboardEvent): void {
      if (evento.key === 'Escape') {
        evento.preventDefault();
        fecharAtual.current();
      }
      if (evento.key !== 'Tab') return;
      const elementos = Array.from(
        painel.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
        ) ?? [],
      ).filter((el) => !el.closest('[hidden], [inert]') && el.tabIndex >= 0);
      const primeiro = elementos[0];
      const ultimo = elementos.at(-1);
      const fora = !elementos.includes(document.activeElement as HTMLElement);
      if (
        !primeiro ||
        fora ||
        (evento.shiftKey ? document.activeElement === primeiro : document.activeElement === ultimo)
      ) {
        evento.preventDefault();
        (evento.shiftKey ? ultimo : primeiro)?.focus();
      }
    }
    document.addEventListener('keydown', aoTeclar);
    return () => {
      document.body.style.overflow = overflowAnterior;
      document.removeEventListener('keydown', aoTeclar);
      if (anterior?.isConnected) anterior.focus();
    };
  }, []);

  return (
    <div className="pv-sobreposicao">
      <div
        className="pv-sobreposicao-fundo"
        onMouseDown={(evento) => {
          if (evento.target === evento.currentTarget) fechar();
        }}
        aria-hidden="true"
      />
      <section
        ref={painel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={idDoTitulo}
        tabIndex={-1}
        className="pv-dialogo"
      >
        <header className="flex items-start justify-between gap-5">
          <div>
            {sobrelinha !== undefined && <p className="sobrelinha">{sobrelinha}</p>}
            <h2 id={idDoTitulo} className="titulo-cena text-label-100">
              {titulo}
            </h2>
          </div>
          <BotaoIcone rotulo={rotuloDeFechar} onClick={fechar}>
            <X size={20} />
          </BotaoIcone>
        </header>
        {children}
      </section>
    </div>
  );
}
