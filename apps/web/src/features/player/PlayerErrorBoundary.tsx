import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  readonly children: ReactNode;
  readonly fallback?: ((erro: Error, tentar: () => void) => ReactNode) | undefined;
}

interface Estado {
  readonly erro: Error | null;
}

/**
 * Última linha de defesa do player.
 *
 * Falha assíncrona do core já vira estado de erro dentro do `EmulatorPlayer`;
 * isto pega o que escapa da renderização — o `TypeError` vindo de dentro de um
 * WASM de terceiro, por exemplo. Sem ele, um erro no player derruba a
 * aplicação inteira para tela branca, e a pessoa perde até o caminho de volta
 * para a biblioteca.
 *
 * Classe porque é a única coisa que o React ainda não expõe como hook.
 */
export class PlayerErrorBoundary extends Component<Props, Estado> {
  override state: Estado = { erro: null };

  static getDerivedStateFromError(erro: Error): Estado {
    return { erro };
  }

  override componentDidCatch(erro: Error, info: ErrorInfo): void {
    console.error('[player] falha não tratada', erro, info.componentStack);
  }

  override render(): ReactNode {
    const { erro } = this.state;
    if (erro === null) return this.props.children;
    if (this.props.fallback) return this.props.fallback(erro, () => this.setState({ erro: null }));

    return (
      <div className="rounded-xl border border-ink-850 bg-ink-900 p-8 text-center">
        <h2 className="font-semibold text-alert">O player parou de responder</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{erro.message}</p>
        <button
          type="button"
          onClick={() => this.setState({ erro: null })}
          className="mt-5 rounded-md bg-alert px-4 py-2 text-sm font-semibold text-ink-950 hover:brightness-110"
        >
          Recarregar o player
        </button>
      </div>
    );
  }
}
