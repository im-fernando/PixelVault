import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variante = 'principal' | 'secundaria' | 'perigo';

/**
 * A pílula: o botão do console, no site. Papel sobre tinta quando manda
 * (`principal`), vidro quando acompanha (`secundaria`), alerta quando apaga
 * (`perigo`). O `atalho` é a tecla que faz o mesmo, mostrada dentro do botão
 * como no "Iniciar jogo ↵" do console.
 */
export function BotaoPilula({
  variante = 'principal',
  pequena = false,
  larga = false,
  atalho,
  className = '',
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  readonly variante?: Variante;
  readonly pequena?: boolean;
  readonly larga?: boolean;
  readonly atalho?: string | undefined;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      className={classesDaPilula({ variante, pequena, larga, className })}
    >
      {children}
      {atalho !== undefined && <kbd>{atalho}</kbd>}
    </button>
  );
}

/** As mesmas classes, para quando a pílula é um `<Link>` e não um botão. */
export function classesDaPilula({
  variante = 'principal',
  pequena = false,
  larga = false,
  className = '',
}: {
  readonly variante?: Variante;
  readonly pequena?: boolean;
  readonly larga?: boolean;
  readonly className?: string;
} = {}): string {
  return [
    'pv-pilula',
    variante === 'secundaria' && 'pv-pilula--secundaria',
    variante === 'perigo' && 'pv-pilula--perigo',
    pequena && 'pv-pilula--pequena',
    larga && 'pv-pilula--larga',
    className,
  ]
    .filter(Boolean)
    .join(' ');
}

/** Botão redondo só de ícone. `rotulo` é obrigatório: ícone sem nome é adivinhação. */
export function BotaoIcone({
  rotulo,
  borda = false,
  className = '',
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'title'> & {
  readonly rotulo: string;
  readonly borda?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <button
      type="button"
      {...props}
      aria-label={rotulo}
      title={rotulo}
      className={`pv-icone ${borda ? 'pv-icone--borda' : ''} ${className}`}
    >
      {children}
    </button>
  );
}

/** Uma tecla, do jeito que o rodapé do console desenha. */
export function Tecla({ children }: { readonly children: ReactNode }) {
  return <kbd className="pv-tecla">{children}</kbd>;
}

/** "⌨ Navegar": a tecla e o que ela faz. */
export function Dica({
  tecla,
  children,
}: {
  readonly tecla: string;
  readonly children: ReactNode;
}) {
  return (
    <span className="pv-dica">
      <Tecla>{tecla}</Tecla>
      {children}
    </span>
  );
}
