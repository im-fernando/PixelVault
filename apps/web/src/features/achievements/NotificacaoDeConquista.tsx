import { Toast } from '../../ui/Painel.js';
import { useSessao } from '../auth/sessao.js';
import { useNotificacaoDeConquista } from './use-notificacao-de-conquista.js';

/**
 * O aviso discreto de "conquista nova" — vive no `Shell` (fora de qualquer
 * rota) porque o desbloqueio pode acontecer em qualquer tela: enviar ROM,
 * gravar save state, sincronizar SRAM. Texto que aparece e some sozinho,
 * nunca modal bloqueante — a issue #121 pede exatamente isso, e o `Toast`
 * compartilhado é a forma que o site inteiro dá a esse tipo de aviso.
 */
export function NotificacaoDeConquista() {
  const sessao = useSessao();
  const aviso = useNotificacaoDeConquista();

  if (sessao.estado !== 'autenticado' || aviso === null) return null;

  return <Toast>{aviso}</Toast>;
}
