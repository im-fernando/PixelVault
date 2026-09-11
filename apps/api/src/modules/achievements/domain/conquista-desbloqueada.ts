import type { AchievementCode } from '@pixelvault/contracts';

/** Alias de domínio para o código do contrato — mesmo raciocínio de `TipoDeSaveNaNuvem` em `progress`. */
export type CodigoDeConquista = AchievementCode;

/** Uma conquista desbloqueada, do jeito que sai do banco. */
export interface ConquistaDesbloqueada {
  readonly userId: string;
  readonly code: CodigoDeConquista;
  /** Carimbado pelo relógio do servidor — nunca o do cliente. */
  readonly unlockedAt: Date;
}
