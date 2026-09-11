import { Sparkles } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';

/** Uma superfície: borda fina, canto de 20px, vidro sobre a tinta. */
export function Painel({
  vidro = false,
  className = '',
  children,
  ...props
}: HTMLAttributes<HTMLDivElement> & { readonly vidro?: boolean; readonly children: ReactNode }) {
  return (
    <div {...props} className={`pv-painel ${vidro ? 'pv-painel--vidro' : ''} ${className}`}>
      {children}
    </div>
  );
}

/**
 * O que houve e como resolver. Sem ícone de perigo e sem pedido de
 * desculpas — o título diz o que aconteceu, o detalhe diz o que fazer.
 */
export function Aviso({
  titulo,
  children,
  acao,
  className = '',
}: {
  readonly titulo: string;
  readonly children?: ReactNode;
  readonly acao?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div role="alert" className={`pv-aviso ${className}`}>
      <p className="text-[15px] font-semibold text-label-100">{titulo}</p>
      {children !== undefined && (
        <div className="mt-1.5 max-w-prose text-[13px] leading-relaxed text-ink-500">
          {children}
        </div>
      )}
      {acao !== undefined && <div className="mt-4">{acao}</div>}
    </div>
  );
}

/** Tela vazia é convite, não lamento: diz o que cabe aqui e dá o comando. */
export function Vazio({
  titulo,
  children,
  acao,
  className = '',
}: {
  readonly titulo: string;
  readonly children?: ReactNode;
  readonly acao?: ReactNode;
  readonly className?: string;
}) {
  return (
    <div className={`pv-vazio ${className}`}>
      <h3 className="titulo-cena text-[clamp(22px,2.4vw,32px)] text-label-100">{titulo}</h3>
      {children !== undefined && (
        <p className="max-w-prose text-[13.5px] leading-relaxed text-ink-500">{children}</p>
      )}
      {acao !== undefined && <div className="mt-3">{acao}</div>}
    </div>
  );
}

/** O aviso que aparece e some sozinho, no rodapé da tela. Nunca modal. */
export function Toast({ children }: { readonly children: ReactNode }) {
  return (
    <p role="status" className="pv-toast">
      <Sparkles size={15} />
      {children}
    </p>
  );
}
