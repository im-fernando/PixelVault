import type { AchievementCode } from '@pixelvault/contracts';

/**
 * O que `profiles` precisa perguntar a quem é dono do dado — mesmo desenho
 * de `leaderboards/domain/portas.ts`: a porta é declarada por quem CONSOME,
 * não importada do tipo de quem responde. Compatibilidade estrutural, não
 * import cruzando módulo.
 *
 * Nenhuma pergunta na direção contrária existe (`identity`, `achievements`
 * e `progress` nunca precisam de nada de `profiles` — é uma tela de leitura
 * agregada, terminal), então não há ciclo real para o `dependency-cruiser`
 * reprovar, e `http/routes.ts` importa as funções que implementam estas
 * portas direto da fachada de cada um, sem passar pela composition root. Ver
 * o cabeçalho de `../index.ts` para o raciocínio completo.
 */

/** O que `identity` (dono da conta) sabe mostrar dela a qualquer pessoa — nunca o e-mail. */
export interface PerfilPublico {
  userId: string;
  handle: string;
  displayName: string;
}

/** Acha o perfil pelo handle da URL — `null` quando não existe conta com esse handle. */
export type ObterPerfilPorHandle = (handle: string) => Promise<PerfilPublico | null>;

/** Uma conquista desbloqueada, como `achievements` responde. */
export interface ConquistaDesbloqueada {
  code: AchievementCode;
  unlockedAt: Date;
}

/** As conquistas já desbloqueadas de uma conta — `achievements` responde, sem checagem de posse. */
export type ObterConquistasDoUsuario = (userId: string) => Promise<ConquistaDesbloqueada[]>;

/** O que `progress` sabe do jogo de uma conta, agregado. */
export interface AgregadoDeJogo {
  readonly jogosDistintos: number;
  readonly segundosJogados: number;
}

/** O agregado de jogo de uma conta — `progress` responde. */
export type ObterAgregadoDeJogo = (userId: string) => Promise<AgregadoDeJogo>;
