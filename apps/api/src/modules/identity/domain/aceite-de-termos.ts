import { ErroDeIdentidade } from './erros.js';

/**
 * Aceite dos termos de uso.
 *
 * A LGPD pede consentimento demonstrável, e demonstrável quer dizer datado.
 * Por isso o aceite não é um booleano guardado no banco: é o instante em que
 * ele aconteceu — e esse instante vem do relógio de quem grava, nunca do
 * cliente, que poderia mandar qualquer data.
 *
 * A função devolve o carimbo em vez de só validar para que seja impossível
 * gravar um `terms_accepted_at` sem ter passado pela recusa: quem não aceitou
 * não tem timestamp para gravar.
 */
export function registrarAceiteDosTermos(aceitou: boolean, agora: Date): Date {
  if (!aceitou) {
    throw new ErroDeIdentidade(
      'TERMOS_NAO_ACEITOS',
      'É preciso aceitar os termos de uso para criar uma conta',
    );
  }
  return agora;
}
