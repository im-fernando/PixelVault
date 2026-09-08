import type { EnvioDeEmail, MensagemDeEmail } from '../domain/envio-de-email.js';

/** Onde a mensagem sai. Parametrizado só para o teste conseguir ler. */
export type EscritorDeLinha = (linha: string) => void;

const REGUA = '─'.repeat(72);

/**
 * O adaptador de e-mail do desenvolvimento: a mensagem sai no console.
 *
 * Console, e não MailHog. Um servidor SMTP de mentira no `docker-compose.yml`
 * daria uma caixa de entrada bonita de navegar, e custaria um serviço a mais
 * para subir, uma porta a mais para colidir e mais uma coisa que precisa
 * estar de pé para o fluxo de "esqueci minha senha" funcionar na máquina de
 * quem acabou de clonar o repositório. O que o critério de aceite da #51 pede
 * é conseguir **receber o link** em desenvolvimento — e para isso o terminal
 * que já está aberto basta.
 *
 * O link aparece sozinho numa linha, sem prefixo colado nele, porque é para
 * ser copiado (ou clicado, que a maioria dos terminais faz) sem edição.
 *
 * Só o corpo em texto é impresso. O HTML iria com ele por completude e
 * transformaria cada e-mail em dezenas de linhas de marcação no terminal,
 * enterrando justamente a linha que interessa.
 */
/**
 * O padrão chama `console.log` em vez de guardar a referência dele: guardar
 * congelaria o `console.log` que existia no instante em que a aplicação foi
 * montada, e qualquer coisa que troque a saída depois disso — um teste, um
 * coletor de log — passaria a ser ignorada em silêncio.
 */
export function criarEnvioPorConsole(
  escrever: EscritorDeLinha = (linha) => {
    // A regra `no-console` existe para pegar depuração esquecida. Este é o
    // único lugar do projeto em que escrever no terminal é a função do
    // código: o adaptador de desenvolvimento é a "caixa de entrada". Não
    // usamos `warn` nem `error` (os dois liberados) porque a mensagem não é
    // nem uma coisa nem outra, e ela sairia no fluxo de erro do processo.
    // eslint-disable-next-line no-console
    console.log(linha);
  },
): EnvioDeEmail {
  return {
    async enviar(mensagem: MensagemDeEmail): Promise<void> {
      escrever(
        [
          '',
          REGUA,
          'E-MAIL (adaptador de desenvolvimento — nada saiu desta máquina)',
          `Para:    ${mensagem.para}`,
          `Assunto: ${mensagem.assunto}`,
          REGUA,
          mensagem.texto,
          REGUA,
          '',
        ].join('\n'),
      );
      return Promise.resolve();
    },
  };
}
