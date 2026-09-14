import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { LinhaDeSecao } from '../../ui/Texto.js';

/**
 * A prateleira: o trilho de cartuchos.
 *
 * Sangra até a borda da tela e continua além dela — porque acervo não termina
 * onde a janela termina. É o mesmo trilho do modo console, com o mesmo
 * respiro entre os itens; a diferença é que aqui ele rola com a página, não
 * com o controle.
 */
export function Prateleira({ children }: { readonly children: ReactNode }) {
  const id = useId();
  const trilho = useRef<HTMLDivElement>(null);
  const [limites, setLimites] = useState({ anterior: false, proximo: false });

  useEffect(() => {
    const elemento = trilho.current;
    if (!elemento) return;
    const atualizar = () =>
      setLimites({
        anterior: elemento.scrollLeft > 1,
        proximo: elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 1,
      });
    atualizar();
    elemento.addEventListener('scroll', atualizar, { passive: true });
    const observador = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(atualizar);
    observador?.observe(elemento);
    for (const filho of elemento.children) observador?.observe(filho);
    window.addEventListener('resize', atualizar);
    return () => {
      elemento.removeEventListener('scroll', atualizar);
      observador?.disconnect();
      window.removeEventListener('resize', atualizar);
    };
  }, [children]);

  const mover = (direcao: number) => {
    const elemento = trilho.current;
    if (!elemento) return;
    elemento.scrollBy({
      left: direcao * elemento.clientWidth * 0.8,
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };

  return (
    <div className="pv-prateleira">
      {(limites.anterior || limites.proximo) && (
        <div className="pv-trilho-controles" role="group" aria-label="Navegar pelos jogos">
          <button
            type="button"
            className="pv-icone"
            aria-label="Jogos anteriores"
            aria-controls={id}
            disabled={!limites.anterior}
            onClick={() => mover(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="pv-icone"
            aria-label="Próximos jogos"
            aria-controls={id}
            disabled={!limites.proximo}
            onClick={() => mover(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
      )}
      <div id={id} ref={trilho} className="pv-trilho">
        {children}
      </div>
    </div>
  );
}

/** O esqueleto de um cartucho, enquanto a prateleira carrega. */
export function CartuchoEsqueleto() {
  return <div className="pv-esqueleto" aria-hidden="true" />;
}

/**
 * A etiqueta da gaveta, no lugar do título de seção.
 *
 * Num arquivo, a gaveta é rotulada com o que tem dentro e quanto tem. A
 * contagem e o tamanho não são enfeite: são como se consulta um acervo.
 */
export function EtiquetaDeGaveta({
  nome,
  itens,
  bytes,
  nota,
}: {
  readonly nome: string;
  readonly itens: number;
  readonly bytes?: number | undefined;
  readonly nota?: string | undefined;
}) {
  const contagem = `${itens} ${itens === 1 ? 'jogo' : 'jogos'}${
    bytes === undefined ? '' : ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`
  }`;
  return <LinhaDeSecao nome={nome} contagem={contagem} nota={nota} />;
}
