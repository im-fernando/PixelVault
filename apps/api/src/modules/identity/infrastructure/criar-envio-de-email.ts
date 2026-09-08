import type { EnvioDeEmail } from '../domain/envio-de-email.js';
import { criarEnvioPorConsole } from './email-console.js';
import { criarEnvioPorResend } from './email-resend.js';

export interface OpcoesDeEnvioDeEmail {
  /** `console` em desenvolvimento e em teste, `resend` em produção. */
  transporte: 'console' | 'resend';
  /** Só usada pelo transporte `resend`. */
  chaveDeApi: string | undefined;
  remetente: string;
}

/**
 * Escolhe o adaptador de e-mail.
 *
 * A escolha é da configuração, não do código: `EMAIL_TRANSPORTE` decide, com
 * padrão derivado do `NODE_ENV` — o mesmo lugar de onde já sai o `Secure` do
 * cookie de sessão. Ver `config.ts` e docs/adr/0020.
 */
export function criarEnvioDeEmail(opcoes: OpcoesDeEnvioDeEmail): EnvioDeEmail {
  if (opcoes.transporte === 'console') return criarEnvioPorConsole();

  if (opcoes.chaveDeApi === undefined) {
    // `loadConfig` já recusa subir nesse estado. Esta guarda existe para a
    // garantia ser local: quem lê este arquivo não precisa ir conferir se
    // alguém, um dia, afrouxou a validação de ambiente lá.
    throw new Error('RESEND_API_KEY é obrigatória quando EMAIL_TRANSPORTE é "resend"');
  }

  return criarEnvioPorResend({ chaveDeApi: opcoes.chaveDeApi, remetente: opcoes.remetente });
}
