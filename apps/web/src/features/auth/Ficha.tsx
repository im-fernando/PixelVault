import { useId, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';

/**
 * As peças de formulário da autenticação, no vocabulário do acervo.
 *
 * Entrar e se cadastrar são a **ficha de inscrição**: papel pautado, campo
 * com pauta embaixo, sem canto arredondado e sem sombra. O desenho é
 * deliberadamente quieto — a ousadia do produto está gasta na prateleira
 * (ver docs/design.md), e um formulário chamativo aqui competiria com ela.
 */

export function Ficha({
  titulo,
  nota,
  children,
}: {
  readonly titulo: string;
  readonly nota: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md px-6">
      <div className="border-b-2 border-ink-850 pb-1.5">
        <h1 className="titulo-estampado text-lg text-label-100">{titulo}</h1>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-ink-500">{nota}</p>
      {children}
    </div>
  );
}

interface PropsDoCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  readonly rotulo: string;
  /** A regra do campo, dita antes de a pessoa errar. */
  readonly ajuda?: string | undefined;
  readonly erro?: string | undefined;
}

export function Campo({ rotulo, ajuda, erro, ...props }: PropsDoCampo) {
  const id = useId();
  const idDaAjuda = `${id}-ajuda`;

  return (
    <div className="mt-5">
      <label htmlFor={id} className="block text-xs font-medium text-ink-500">
        {rotulo}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={erro === undefined ? undefined : true}
        aria-describedby={erro === undefined && ajuda === undefined ? undefined : idDaAjuda}
        className={`mt-1.5 w-full border-b bg-ink-900/60 px-3 py-2 text-sm text-label-100 caret-label-400 outline-none transition-colors placeholder:text-ink-700 focus:bg-ink-900 disabled:opacity-50 ${
          erro === undefined
            ? 'border-ink-700 focus:border-label-400'
            : 'border-alert focus:border-alert'
        }`}
      />
      {(erro ?? ajuda) !== undefined && (
        <p
          id={idDaAjuda}
          className={`mt-1.5 text-xs ${erro === undefined ? 'text-ink-700' : 'text-alert'}`}
        >
          {erro ?? ajuda}
        </p>
      )}
    </div>
  );
}

export function Caixa({
  erro,
  children,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type'> & {
  readonly erro?: string | undefined;
  readonly children: ReactNode;
}) {
  const id = useId();

  return (
    <div className="mt-6">
      <div className="flex items-start gap-2.5">
        <input
          {...props}
          id={id}
          type="checkbox"
          className="mt-0.5 h-4 w-4 shrink-0 accent-label-400"
        />
        <label htmlFor={id} className="text-xs leading-relaxed text-ink-500">
          {children}
        </label>
      </div>
      {erro !== undefined && <p className="mt-1.5 text-xs text-alert">{erro}</p>}
    </div>
  );
}

/**
 * O erro que não é de campo nenhum.
 *
 * Mesma forma do "O acervo não respondeu" da estante: barra de atenção à
 * esquerda, sem ícone e sem pedido de desculpas. É aqui que cai a recusa de
 * credencial do login, com a mensagem que o servidor mandou — e só ela.
 */
export function Recusa({ children }: { readonly children: ReactNode }) {
  return (
    <p
      role="alert"
      className="mt-6 border-l-2 border-alert bg-ink-900 px-4 py-3 text-sm text-label-100"
    >
      {children}
    </p>
  );
}

export function BotaoPrincipal({
  children,
  ocupado,
  ...props
}: {
  readonly children: ReactNode;
  readonly ocupado: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type' | 'disabled'>) {
  return (
    <button
      {...props}
      type="submit"
      disabled={ocupado}
      className="titulo-estampado mt-7 w-full bg-label-100 px-4 py-2.5 text-sm text-ink-950 outline-none transition-colors hover:bg-label-200 focus-visible:ring-2 focus-visible:ring-label-400 focus-visible:ring-offset-2 focus-visible:ring-offset-ink-950 disabled:cursor-progress disabled:opacity-45"
    >
      {children}
    </button>
  );
}
