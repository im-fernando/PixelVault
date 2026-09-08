import type { SessionRepository } from '../domain/session-repository.js';
import { calcularExpiracao, precisaRenovar, sessaoExpirou } from '../domain/sessao.js';

export interface DependenciasDeResolucao {
  sessoes: SessionRepository;
  hashDoToken: (token: string) => string;
  agora: () => Date;
}

export interface SessaoResolvida {
  /**
   * Qual sessão é esta, entre as várias que a pessoa pode ter abertas.
   *
   * Não é curiosidade: sem ele, "sair de todos os outros aparelhos" não teria
   * como saber qual poupar, e a listagem não teria como marcar "este é o
   * dispositivo em que você está agora". É o id da linha, nunca o token.
   */
  sessionId: string;
  userId: string;
  /**
   * Preenchido só quando a renovação deslizante rodou nesta requisição —
   * a borda usa isso para reescrever o cookie com a validade nova, senão o
   * navegador continuaria descartando o cookie na data antiga enquanto o
   * servidor já considera a sessão boa por mais 30 dias.
   */
  renovadaAte?: Date;
}

/**
 * Traduz o token do cookie em "quem é esta pessoa", ou `null`.
 *
 * `null` cobre tudo que não é uma sessão viva: token que não existe, token
 * adulterado, sessão expirada. Um caso só, de propósito — quem chama não
 * tem o que fazer de diferente entre eles, e distinguir na resposta só
 * ajudaria quem está sondando.
 *
 * O token nunca é comparado com nada guardado em claro: hasheia-se o que
 * veio e procura-se pelo hash, que é o que a tabela tem. Um dump da tabela
 * `sessions`, por isso, não permite forjar cookie nenhum.
 */
export async function resolverSessao(
  deps: DependenciasDeResolucao,
  token: string,
): Promise<SessaoResolvida | null> {
  const sessao = await deps.sessoes.buscarPorTokenHash(deps.hashDoToken(token));
  if (sessao === null) return null;

  const agora = deps.agora();
  if (sessaoExpirou(sessao.expiresAt, agora)) {
    // Limpeza preguiçosa, metade um: quem toca numa sessão vencida a enterra.
    // A linha não serve para mais nada — recusá-la e deixá-la no banco só
    // garantiria que ela fosse recusada de novo amanhã. A outra metade está
    // em `listar-sessoes.ts`, e o porquê de não haver cron está lá.
    await deps.sessoes.revogar(sessao.id, sessao.userId);
    return null;
  }

  if (!precisaRenovar(sessao.expiresAt, agora)) {
    return { sessionId: sessao.id, userId: sessao.userId };
  }

  const novaExpiracao = calcularExpiracao(agora);
  await deps.sessoes.renovar(sessao.id, novaExpiracao, agora);
  return { sessionId: sessao.id, userId: sessao.userId, renovadaAte: novaExpiracao };
}
