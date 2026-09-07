import type { ReactNode } from 'react';

/**
 * A prateleira.
 *
 * Sangra até a borda da tela e **continua além dela** — porque acervo não
 * termina onde a janela termina. Os cartuchos ficam encostados uns nos outros,
 * sem espaçamento: espaço entre itens transforma prateleira em grade de
 * cartões, que é exatamente o que estamos evitando.
 *
 * A madeira embaixo não é enfeite: é o que dá o chão contra o qual o cartucho
 * se levanta ao ser escolhido.
 */
export function Prateleira({ children }: { readonly children: ReactNode }) {
  return (
    <div className="relative">
      <div className="overflow-x-auto overflow-y-hidden pt-6 [scrollbar-width:thin]">
        <div className="flex w-max items-end gap-px px-6 pb-1">
          {children}
          <Aparador />
        </div>
      </div>
      {/* O tampo. A sombra por cima é o vão da estante. */}
      {/* O tampo. A linha clara em cima é a quina pegando luz; a sombra
          embaixo é o vão da estante. Junto, dão o chão contra o qual o
          cartucho se levanta ao ser escolhido. */}
      <div className="h-px w-full bg-ink-700/60" />
      <div className="h-2.5 w-full bg-ink-850" />
      <div className="h-5 w-full bg-gradient-to-b from-black/45 to-transparent" />
    </div>
  );
}

/**
 * O aparador de livros no fim da fileira.
 *
 * Não é enfeite: é o que faz um acervo pequeno parecer **curado** em vez de
 * vazio. Sem ele, quatro cartuchos numa estante larga leem como falta; com
 * ele, leem como a coleção que existe hoje.
 */
function Aparador() {
  return (
    <div className="ml-0.5 flex h-24 w-2 shrink-0 items-end" aria-hidden="true">
      <div className="h-full w-full rounded-t-[1px] bg-gradient-to-r from-ink-700 to-ink-800 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.6)]" />
    </div>
  );
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
  return (
    <div className="mx-6 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-ink-850 pb-1.5">
      <h2 className="titulo-estampado text-sm text-label-100">{nome}</h2>
      <span className="leitura text-ink-700">
        {itens} {itens === 1 ? 'item' : 'itens'}
        {bytes !== undefined && ` · ${(bytes / 1024 / 1024).toFixed(1)} MB`}
      </span>
      {nota !== undefined && <span className="ml-auto text-xs text-ink-700">{nota}</span>}
    </div>
  );
}
