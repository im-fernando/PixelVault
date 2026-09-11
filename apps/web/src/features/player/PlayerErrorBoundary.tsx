import { Component, type ErrorInfo, type ReactNode } from 'react';
import { BotaoPilula } from '../../ui/Botao.js';
import { Aviso } from '../../ui/Painel.js';

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
      <Aviso
        titulo="O player parou de responder"
        acao={
          <BotaoPilula pequena onClick={() => this.setState({ erro: null })}>
            Recarregar o player
          </BotaoPilula>
        }
      >
        {erro.message}
      </Aviso>
    );
  }
}
