/** Uma mensagem pronta para sair: destinatário, assunto e os dois corpos. */
export interface MensagemDeEmail {
  /** Endereço do destinatário, já normalizado. */
  para: string;
  assunto: string;
  /**
   * O corpo em texto puro. É o corpo de verdade, não um consolo para leitor
   * antigo: cliente que bloqueia HTML por padrão, leitor de tela e o filtro
   * de spam (que desconfia de mensagem só-HTML) leem este.
   */
  texto: string;
  /** O mesmo conteúdo em HTML. Nunca traz nada que o texto não traga. */
  html: string;
}

/**
 * Porta de envio de e-mail.
 *
 * É uma porta de verdade, e não cerimônia, pelo critério da
 * [ADR 0004](../../../../../../docs/adr/0004-hexagonal-apenas-nas-integracoes-externas.md):
 * existe mais de um adaptador plausível e os dois estão em uso desde o
 * primeiro dia — o Resend em produção e o console em desenvolvimento (ver
 * docs/adr/0020). Não é o caso do banco, que tem um adaptador só e por isso
 * não virou porta.
 *
 * Um método, e nenhuma noção de "e-mail de recuperação": quem monta a
 * mensagem é o domínio (`email-de-recuperacao.ts`), quem a entrega é o
 * adaptador, e nenhum dos dois sabe o que o outro faz. É o que permite ao
 * segundo e-mail transacional do produto reusar isto sem tocar em nada.
 *
 * `enviar` devolve promessa porque entregar é I/O e fingir o contrário
 * esconderia a falha. Quem chama, porém, não espera por ela — ver
 * `application/solicitar-recuperacao-de-senha.ts` para o motivo, que é de
 * segurança e não de desempenho.
 */
export interface EnvioDeEmail {
  enviar(mensagem: MensagemDeEmail): Promise<void>;
}
