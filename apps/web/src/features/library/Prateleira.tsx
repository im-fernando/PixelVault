import type { ReactNode } from 'react';
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
  return <div className="pv-trilho">{children}</div>;
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
