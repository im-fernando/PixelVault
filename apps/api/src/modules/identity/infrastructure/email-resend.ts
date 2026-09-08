import { Resend } from 'resend';
import type { EnvioDeEmail, MensagemDeEmail } from '../domain/envio-de-email.js';

export interface OpcoesDoResend {
  chaveDeApi: string;
  /** O remetente, no formato `Nome <endereco@dominio>`. */
  remetente: string;
}

/**
 * O adaptador de produção, sobre o SDK oficial do Resend
 * (ver [ADR 0020](../../../../../../docs/adr/0020-usar-resend-para-email-transacional.md)).
 *
 * Duas coisas que o SDK faz e este adaptador desfaz:
 *
 * 1. **Ele não lança.** `emails.send` devolve `{ data, error }` e resolve a
 *    promessa mesmo quando o envio falhou. Um adaptador que só devolvesse
 *    esse objeto faria toda falha de entrega passar em silêncio por quem
 *    chama. Aqui o `error` vira exceção, que é o que a porta promete.
 * 2. **O cliente é criado uma vez.** Instanciar `Resend` por mensagem
 *    descartaria a conexão _keep-alive_ a cada envio.
 *
 * O que ele **não** faz: repetir a tentativa. Um envio que falha aqui vira
 * log, e quem esqueceu a senha pede de novo — o que já custa uma linha no
 * contador de tentativas e, portanto, tem teto. Repetir sozinho é o caminho
 * mais curto para mandar a mesma mensagem três vezes quando a falha foi só o
 * `ACK` que se perdeu.
 */
export function criarEnvioPorResend(opcoes: OpcoesDoResend): EnvioDeEmail {
  const cliente = new Resend(opcoes.chaveDeApi);

  return {
    async enviar(mensagem: MensagemDeEmail): Promise<void> {
      const { error } = await cliente.emails.send({
        from: opcoes.remetente,
        to: mensagem.para,
        subject: mensagem.assunto,
        text: mensagem.texto,
        html: mensagem.html,
      });

      if (error !== null) {
        throw new Error(`Resend recusou o envio: ${error.name} — ${error.message}`);
      }
    },
  };
}
