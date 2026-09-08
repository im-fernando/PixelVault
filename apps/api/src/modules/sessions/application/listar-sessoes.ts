import type { SessionRepository } from '../domain/session-repository.js';

export interface DependenciasDeListagem {
  sessoes: SessionRepository;
  agora: () => Date;
}

/** Uma sessão da listagem, já sabendo se é a que está pedindo. */
export interface SessaoListada {
  id: string;
  userAgent: string | null;
  ipTruncated: string | null;
  createdAt: Date;
  lastSeenAt: Date;
  atual: boolean;
}

/**
 * "Onde eu estou logado."
 *
 * A limpeza das sessões vencidas acontece aqui, antes de listar, e é
 * deliberadamente preguiçosa — não há cron neste projeto, e a ADR 0017 já
 * registrou a poda como dívida. Duas razões para resolvê-la assim em vez de
 * montar a primeira infraestrutura de job da casa por causa disto:
 *
 * 1. **Corretude não depende da poda.** Sessão vencida já era recusada por
 *    `resolver-sessao.ts` antes desta issue existir; podar é higiene da
 *    tabela, não regra de segurança. Um cron atrasado nunca deixaria uma
 *    sessão morta autenticar ninguém.
 * 2. **O custo é onde a informação está.** O `DELETE` é por `userId`
 *    indexado, roda numa rota que a pessoa abre para justamente ver e
 *    limpar as próprias sessões, e apaga exatamente as linhas que ela
 *    veria como lixo. Um job global varreria a tabela inteira para o mesmo
 *    efeito.
 *
 * O limite honesto: sessão de quem nunca mais volta não é podada por
 * ninguém. Se a tabela virar problema de tamanho, aí sim vale um
 * `DELETE ... WHERE expires_at < now()` periódico — que é operação, não
 * mudança de contrato.
 */
export async function listarSessoes(
  deps: DependenciasDeListagem,
  userId: string,
  sessaoAtual: string,
): Promise<SessaoListada[]> {
  await deps.sessoes.apagarExpiradas(userId, deps.agora());

  const sessoes = await deps.sessoes.listarDoUsuario(userId);
  return sessoes.map((sessao) => ({ ...sessao, atual: sessao.id === sessaoAtual }));
}
