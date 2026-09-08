/**
 * Prazo de vida de uma sessão: 30 dias. Ver docs/adr/0017.
 *
 * Não é um número solto: é o mesmo prazo usado para nascer e para renovar,
 * e a renovação usa a metade dele como gatilho. Ter os três derivados de
 * uma constante só é o que impede a janela de renovação e a janela de vida
 * saírem de sincronia numa mudança futura.
 */
export const DURACAO_DA_SESSAO_MS = 30 * 24 * 60 * 60 * 1000;

/** Uma sessão como o banco a devolve — sem o token, que ninguém guarda. */
export interface SessaoAtiva {
  id: string;
  userId: string;
  expiresAt: Date;
}

export function calcularExpiracao(agora: Date): Date {
  return new Date(agora.getTime() + DURACAO_DA_SESSAO_MS);
}

/**
 * Expirada quando o instante de expiração já passou. O limite é fechado do
 * lado da expiração de propósito: exatamente em `expiresAt` a sessão já não
 * vale mais.
 */
export function sessaoExpirou(expiresAt: Date, agora: Date): boolean {
  return expiresAt.getTime() <= agora.getTime();
}

/**
 * Renovação deslizante: renova quando resta menos da metade do prazo.
 *
 * Metade, e não "toda requisição", porque renovar sempre significa um UPDATE
 * por requisição autenticada — o custo de escrita de um site inteiro para
 * ganhar precisão que ninguém percebe. Com a metade, um dispositivo em uso
 * escreve no máximo uma vez a cada 15 dias e nunca desloga sozinho; um
 * abandonado morre em até 30 dias.
 *
 * Sessão já expirada não "precisa renovar": ela precisa ser recusada. Por
 * isso o `restante > 0` — sem ele, uma sessão vencida há um ano voltaria a
 * valer por mais 30 dias.
 */
export function precisaRenovar(expiresAt: Date, agora: Date): boolean {
  const restante = expiresAt.getTime() - agora.getTime();
  return restante > 0 && restante < DURACAO_DA_SESSAO_MS / 2;
}
