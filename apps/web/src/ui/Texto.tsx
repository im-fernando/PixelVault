import type { ReactNode } from 'react';

/** A linha pequena e espaçada que diz de que se trata a cena. */
export function Sobrelinha({
  children,
  className = '',
}: {
  readonly children: ReactNode;
  readonly className?: string;
}) {
  return <p className={`sobrelinha ${className}`}>{children}</p>;
}

/**
 * A linha que abre uma seção: o nome, a contagem e uma nota à direita — o
 * rótulo que a gaveta de um arquivo teria, com o dado que ela carregaria.
 */
export function LinhaDeSecao({
  nome,
  contagem,
  nota,
  id,
}: {
  readonly nome: string;
  readonly contagem?: string | undefined;
  readonly nota?: string | undefined;
  readonly id?: string | undefined;
}) {
  return (
    <div className="pv-secao">
      <h2 id={id}>{nome}</h2>
      {contagem !== undefined && <span className="leitura">{contagem}</span>}
      {nota !== undefined && <span>{nota}</span>}
    </div>
  );
}

/** Rótulo em cima, valor embaixo. Dado de máquina sai na bitmap. */
export function Verbete({
  rotulo,
  valor,
  maquina = false,
  nota,
}: {
  readonly rotulo: string;
  readonly valor: ReactNode;
  readonly maquina?: boolean;
  readonly nota?: string | undefined;
}) {
  return (
    <div className="pv-verbete min-w-0">
      <dt>{rotulo}</dt>
      <dd className={maquina ? 'leitura truncate text-label-200' : 'truncate'}>{valor}</dd>
      {nota !== undefined && <p className="mt-1 text-[11px] text-ink-700">{nota}</p>}
    </div>
  );
}

/** Um número grande, em Archivo — contagem, posição, tempo. */
export function Numero({
  valor,
  rotulo,
  nota,
}: {
  readonly valor: ReactNode;
  readonly rotulo: string;
  readonly nota?: string | undefined;
}) {
  return (
    <div className="min-w-0">
      <p className="sobrelinha">{rotulo}</p>
      <p className="pv-numero mt-2 text-[clamp(28px,3vw,44px)] text-label-100">{valor}</p>
      {nota !== undefined && <p className="mt-1 text-[11.5px] text-ink-500">{nota}</p>}
    </div>
  );
}
