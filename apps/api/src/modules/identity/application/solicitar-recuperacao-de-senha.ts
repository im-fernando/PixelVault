import { randomUUID } from 'node:crypto';
import {
  VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS,
  type ForgotPasswordRequest,
} from '@pixelvault/contracts';
import { emailDeRecuperacao, linkDeRedefinicao } from '../domain/email-de-recuperacao.js';
import { Email } from '../domain/email.js';
import type { MensagemDeEmail } from '../domain/envio-de-email.js';
import type { TokenDeRecuperacaoRepository } from '../domain/token-de-recuperacao-repository.js';

export interface DependenciasDaRecuperacao {
  tokens: TokenDeRecuperacaoRepository;
  gerarToken: () => string;
  hashDoToken: (token: string) => string;
  /** De onde sai o link do e-mail. É `WEB_ORIGIN`, nunca um cabeçalho. */
  origemDoFront: string;
  agora: () => Date;
  /**
   * Despacha a mensagem **sem** que este caso de uso espere pela entrega.
   * Síncrono de propósito — ver o cabeçalho da função.
   */
  despachar: (mensagem: MensagemDeEmail) => void;
}

/**
 * Pedido de redefinição de senha.
 *
 * Esta função não devolve nada, e não é preguiça de tipo: **não existe
 * resultado a devolver**. Ela é chamada do mesmo jeito, faz o mesmo trabalho
 * e termina do mesmo jeito para um e-mail que tem conta e para um que não
 * tem. Quem chamou não fica com nenhuma informação nas mãos, então não há
 * como a rota, hoje ou depois de uma refatoração distraída, responder
 * diferente nos dois casos.
 *
 * O padrão é o que a #45 estabeleceu no cadastro
 * (`registrar-usuario.ts`), aplicado ponto a ponto:
 *
 * 1. **Não há `SELECT` por e-mail.** A existência da conta é decidida dentro
 *    do banco, no mesmo comando que grava o token
 *    (`criarSeContaExistir` → `INSERT ... SELECT`). Um `SELECT` isolado
 *    colocaria a informação "esta conta existe" numa variável, e variável
 *    assim mais cedo ou mais tarde vira `if`.
 * 2. **Os dois caminhos pagam o mesmo.** Token gerado, hasheado e oferecido
 *    ao banco antes de qualquer coisa se saber. O trabalho é idêntico até o
 *    fim.
 * 3. **Sem retorno antecipado.** Nem para e-mail malformado: `chaveDeBusca`
 *    normaliza qualquer texto, e o banco responde "nenhuma linha" — que é o
 *    mesmo caminho de um e-mail bem formado sem conta. Recusar cedo criaria
 *    um terceiro tempo de resposta.
 *
 * ### Por que o envio não é esperado
 *
 * `despachar` é síncrono e o e-mail sai por fora da requisição. Se este caso
 * de uso esperasse o provedor responder (algumas centenas de milissegundos
 * de rede), o caminho "existe conta" ficaria visivelmente mais lento que o
 * caminho "não existe" — e todo o cuidado acima seria desfeito por um
 * cronômetro, que é exatamente o ataque que o `HASH_DESCARTAVEL` do login
 * existe para impedir (docs/seguranca.md). Aqui não dá para igualar os dois
 * lados pagando o custo nos dois: mandar e-mail para um endereço sem conta,
 * só para gastar o mesmo tempo, seria transformar a API num disparador de
 * mensagem para qualquer endereço que alguém digitasse.
 *
 * O preço dessa escolha é que uma falha de entrega não pode virar resposta
 * de erro — ela vira log do servidor. E é o que se quer de qualquer forma:
 * "não consegui mandar" só é dizível para quem tem conta.
 */
export async function solicitarRecuperacaoDeSenha(
  deps: DependenciasDaRecuperacao,
  entrada: ForgotPasswordRequest,
): Promise<void> {
  // A mesma normalização que o cadastro usou para gravar e que o contador de
  // tentativas usa para contar — senão alternar maiúsculas daria um caminho
  // diferente para a mesma conta.
  const email = Email.chaveDeBusca(entrada.email);

  const token = deps.gerarToken();
  const agora = deps.agora();

  const gravado = await deps.tokens.criarSeContaExistir(email, {
    id: randomUUID(),
    tokenHash: deps.hashDoToken(token),
    expiresAt: new Date(agora.getTime() + VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS),
  });

  if (gravado) {
    deps.despachar(emailDeRecuperacao(email, linkDeRedefinicao(deps.origemDoFront, token)));
  }

  // A poda vem depois do despacho e vale para todas as contas, não só para
  // esta: é a mesma limpeza preguiçosa das sessões (#47) e do contador de
  // tentativas (#49), pendurada no trabalho que já está acontecendo em vez de
  // num cron que o projeto não tem. Ela roda nos dois caminhos, e é de
  // propósito — trabalho que só acontecesse quando a conta existe seria mais
  // um relógio a denunciar a diferença.
  await deps.tokens.podarExpirados(agora);
}
