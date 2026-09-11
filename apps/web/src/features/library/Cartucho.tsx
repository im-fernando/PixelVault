import { Heart } from 'lucide-react';
import type { ReactNode } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { Arte } from '../../ui/Arte.js';

/**
 * Um cartucho no trilho.
 *
 * Deixou de ser lombada de 14px com título na vertical: a arte do jogo é a
 * imagem, como no modo console, e o título fica embaixo. O que a lombada
 * tinha de bom — o matiz estável por título quando não há capa, o número de
 * acervo, a marca de favorito visível de longe — continua, só que dentro da
 * moldura quadrada que o console já usa. Ver docs/design.md e a ADR 0024.
 *
 * As ações (jogar, favoritar, ranking, remover) chegam prontas por `acoes` e
 * aparecem numa barra sobre a arte ao passar o mouse ou ao dar foco. O
 * cartucho não sabe o que se faz com ele; quem sabe é a prateleira que o
 * desenhou. Quem quer o cartucho INTEIRO como link usa `MioloDoCartucho`
 * dentro de um `<Link className="pv-cartucho">` — um `<a>` por cima de uma
 * barra de botões seria elemento interativo dentro de elemento interativo.
 */

interface PropsDoMiolo {
  readonly titulo: string;
  /**
   * De que console. Nulo quando nem o catálogo nem a extensão do arquivo
   * respondem — caso que a biblioteca pessoal traz e que não pode virar
   * cartucho ausente: a ROM está lá, e a estante precisa dizer isso.
   */
  readonly systemId: SystemId | null;
  readonly capaUrl?: string | null | undefined;
  /** O carimbo no canto da arte: "Homebrew", "Precisa da sua ROM". */
  readonly selo?: string | undefined;
  /** A linha embaixo do título: autor e ano, tamanho, procedência. */
  readonly nota?: string | undefined;
  /**
   * A marca de favorito: visível com o cartucho fechado, que é quando ela
   * serve para achar o item sem ler a fileira inteira.
   */
  readonly favorito?: boolean;
  readonly acoes?: ReactNode;
}

export function MioloDoCartucho({
  titulo,
  systemId,
  capaUrl,
  selo,
  nota,
  favorito = false,
  acoes,
}: PropsDoMiolo) {
  return (
    <>
      {selo !== undefined && <span className="pv-cartucho-selo">{selo}</span>}
      {favorito && (
        <Heart className="pv-cartucho-favorito" size={14} fill="currentColor" aria-hidden="true" />
      )}
      <Arte titulo={titulo} sistema={systemId} capaUrl={capaUrl} />
      {acoes !== undefined && <div className="pv-cartucho-acoes">{acoes}</div>}
      <span className="pv-cartucho-titulo">{titulo}</span>
      <span className="pv-cartucho-nota">{nota ?? numeroDeAcervo(titulo, systemId)}</span>
    </>
  );
}

export function Cartucho({
  desbotado = false,
  rotulo,
  ...miolo
}: PropsDoMiolo & {
  readonly desbotado?: boolean;
  /** O nome do grupo para quem navega por leitor de tela. */
  readonly rotulo?: string | undefined;
}) {
  return (
    <div
      className={`pv-cartucho ${desbotado ? 'pv-cartucho--desbotado' : ''}`}
      role="group"
      aria-label={rotulo ?? miolo.titulo}
      title={desbotado ? `${miolo.titulo} — precisa da sua ROM` : undefined}
    >
      <MioloDoCartucho {...miolo} />
    </div>
  );
}

/** Num arquivo, todo item tem um número — inclusive o de procedência incerta. */
export function numeroDeAcervo(titulo: string, systemId: SystemId | null): string {
  let h = 7;
  for (const ch of titulo) h = (h * 33 + ch.codePointAt(0)!) % 100000;
  return `${(systemId ?? 'rom').toUpperCase()}-${String(h).padStart(5, '0')}`;
}
