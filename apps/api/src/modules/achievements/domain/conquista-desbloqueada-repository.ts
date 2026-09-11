import type { CodigoDeConquista, ConquistaDesbloqueada } from './conquista-desbloqueada.js';

/** O que voltou de uma tentativa de desbloqueio. */
export interface ResultadoDoDesbloqueio {
  /**
   * `true` só na primeira vez que aquela conta desbloqueia aquele código.
   * É o que faz enviar a segunda ROM não desbloquear "de novo" — a segunda
   * chamada devolve `false`, sem erro, sem segunda linha.
   */
  readonly novaConquista: boolean;
}

/**
 * Porta de persistência das conquistas desbloqueadas.
 *
 * Declarada no domínio e implementada em `infrastructure/` — o domínio diz o
 * que precisa, a infraestrutura resolve como. Ver docs/adr/0004.
 *
 * Dois chamadores, dois desenhos de uso: o evento (ROM, save state,
 * sincronização) chama `desbloquear` sempre que o evento acontece, e deixa a
 * idempotência para a constraint única do banco — nunca verifica antes se já
 * tinha, porque isso seria uma corrida (duas gravações concorrentes,
 * nenhuma vendo a outra) disfarçada de otimização. A agregação (coleção,
 * jogos distintos, horas jogadas) chama `desbloquear` só para os códigos que
 * o cálculo determinou que já deveriam estar desbloqueados — a mesma
 * garantia de idempotência cobre o caso de listar duas vezes sem que nada
 * tenha mudado.
 */
export interface ConquistaDesbloqueadaRepository {
  /**
   * Registra o desbloqueio, ou não faz nada se a conta já tinha aquele
   * código — a idempotência do critério de aceite ("enviar a segunda ROM
   * não desbloqueia de novo") mora aqui, na constraint `@@unique([userId,
   * code])` de `user_achievements`, não numa checagem prévia do caso de uso.
   */
  desbloquear(userId: string, code: CodigoDeConquista): Promise<ResultadoDoDesbloqueio>;

  /** Todas as conquistas que aquela conta já desbloqueou, para a listagem. */
  listar(userId: string): Promise<ConquistaDesbloqueada[]>;

  /**
   * Os códigos, dentre os informados, que aquela conta já tem.
   *
   * Usado pelo cálculo de agregação para não tentar desbloquear de novo um
   * código que já apareceria como `novaConquista: false` — evita uma
   * chamada a `desbloquear` por tier em toda listagem, quando a conta já
   * tem os tiers de sempre.
   */
  quaisJaTem(userId: string, codes: readonly CodigoDeConquista[]): Promise<Set<CodigoDeConquista>>;
}
