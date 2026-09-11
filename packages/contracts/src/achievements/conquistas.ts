import { z } from 'zod';

/**
 * As conquistas de plataforma da M6 — o plano B do
 * [ADR 0008](../../../../docs/adr/0008-viabilidade-de-conquistas-por-evento-de-jogo.md),
 * detalhado em [ADR 0010](../../../../docs/adr/0010-regras-de-gamificacao-da-m6.md).
 *
 * Os códigos ficam em português e em `snake_case`, ao contrário do resto do
 * vocabulário público (que segue o inglês da API): não são rota nem verbo
 * HTTP, são o nome de uma conquista igual a um enum de banco — o mesmo motivo
 * que faz `SaveKind` do banco valer inglês e o `status` de uma resposta de
 * domínio valer português. O front usa o código para escolher texto e ícone;
 * a data de desbloqueio já é o suficiente para o resto.
 */
export const achievementCodeSchema = z.enum([
  /** A primeira ROM que a conta enviou para a própria biblioteca. */
  'primeira_rom_enviada',
  /** O primeiro save state que a conta sincronizou com a nuvem. */
  'primeiro_save_state',
  /** A primeira SRAM que a conta sincronizou com a nuvem. */
  'primeira_sincronizacao',
  /** 10, 50 e 100 ROMs na biblioteca — ver o ADR para o porquê dos números. */
  'colecionista_bronze',
  'colecionista_prata',
  'colecionista_ouro',
  /** 5, 20 e 50 jogos distintos jogados (linhas de `user_games`). */
  'explorador_bronze',
  'explorador_prata',
  'explorador_ouro',
  /**
   * 1, 10 e 50 horas jogadas, somando `UserGame.totalPlaytimeSeconds` da
   * conta. Sempre zero até a #119 escrever playtime de verdade — ver o
   * comentário de `domain/agregacao.ts` no módulo `achievements`.
   */
  'dedicacao_bronze',
  'dedicacao_prata',
  'dedicacao_ouro',
]);
export type AchievementCode = z.infer<typeof achievementCodeSchema>;

/** Uma conquista desbloqueada, do jeito que sai de `GET /api/achievements`. */
export const unlockedAchievementSchema = z.object({
  code: achievementCodeSchema,
  /** Carimbado pelo relógio do servidor no momento do desbloqueio. */
  unlockedAt: z.iso.datetime(),
});
export type UnlockedAchievement = z.infer<typeof unlockedAchievementSchema>;

/**
 * Resposta de `GET /api/achievements`: as conquistas que a conta já tem,
 * sem ordem garantida além da que o banco devolver. Conquista que a conta
 * não desbloqueou simplesmente não aparece — não há "conquista bloqueada"
 * na resposta, porque a lista completa de conquistas existentes é estática
 * e vive no front, não precisa de uma viagem de rede.
 */
export const achievementListResponseSchema = z.object({
  achievements: z.array(unlockedAchievementSchema),
});
export type AchievementListResponse = z.infer<typeof achievementListResponseSchema>;
