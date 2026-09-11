import { useSessao } from '../auth/sessao.js';
import { useNotificacaoDeConquista } from './use-notificacao-de-conquista.js';

/**
 * O aviso discreto de "conquista nova" — vive no `Shell` (fora de qualquer
 * rota) porque o desbloqueio pode acontecer em qualquer tela: enviar ROM,
 * gravar save state, sincronizar SRAM. Mesma linguagem visual de
 * `IndicadorDeSincronizacao`/`EmulatorPlayer`: texto que aparece e some
 * sozinho, nunca modal bloqueante — a issue #121 pede exatamente isso.
 *
 * Fica fixo no rodapé da tela, e não empurra o layout: `position: fixed`
 * para não competir por espaço com o que a pessoa está fazendo.
 */
export function NotificacaoDeConquista() {
  const sessao = useSessao();
  const aviso = useNotificacaoDeConquista();

  if (sessao.estado !== 'autenticado' || aviso === null) return null;

  return (
    <p
      role="status"
      className="leitura fixed bottom-4 left-1/2 z-50 -translate-x-1/2 rounded border border-ink-800 bg-ink-900 px-4 py-2 text-label-200 shadow-lg"
    >
      {aviso}
    </p>
  );
}
