import { z } from 'zod';

/**
 * Intervalo entre heartbeats do front, em segundos — issue #119.
 *
 * 20s: perto do que sistemas de presença costumam usar (nem tão curto que
 * vire uma requisição a cada poucos segundos de sessão longa, nem tão longo
 * que o teto abaixo vire perceptível para quem realmente jogou o intervalo
 * inteiro). Ver docs/adr/0009.
 */
export const INTERVALO_DE_HEARTBEAT_SEGUNDOS = 20;

/**
 * Teto de segundos creditados por heartbeat — `INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1.5`.
 *
 * Um heartbeat que chega depois de um hiato (aba oculta e voltou, laptop
 * suspenso, retomada de rede) não credita o hiato inteiro: credita no máximo
 * isto. Meia folga acima do intervalo normal absorve variação de rede sem
 * abrir a porta para inflar tempo por atraso. Ver docs/adr/0009.
 */
export const TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS = Math.round(
  INTERVALO_DE_HEARTBEAT_SEGUNDOS * 1.5,
);

/**
 * Resposta de `POST /api/progress/heartbeat/:romId`.
 *
 * `sem-jogo-reconhecido` não é erro — é a ROM sem `gameId` (BYOR, ADR 0006):
 * não existe `UserGame` para creditar sem jogo do catálogo. `creditado`
 * sempre existe, mesmo quando `segundosCreditados` é `0` (primeiro heartbeat
 * de uma sessão, ou heartbeat chegou cedo demais desde o anterior) — o
 * relógio que decide é sempre o do servidor, nunca o do corpo da requisição,
 * que por isso não existe: esta rota não aceita nenhum timestamp do cliente.
 */
export const heartbeatCreditadoSchema = z.object({
  status: z.literal('creditado'),
  segundosCreditados: z.number().int().min(0),
  totalPlaytimeSeconds: z.number().int().min(0),
});
export type HeartbeatCreditado = z.infer<typeof heartbeatCreditadoSchema>;

export const heartbeatSemJogoReconhecidoSchema = z.object({
  status: z.literal('sem-jogo-reconhecido'),
});
export type HeartbeatSemJogoReconhecido = z.infer<typeof heartbeatSemJogoReconhecidoSchema>;

export const heartbeatResponseSchema = z.discriminatedUnion('status', [
  heartbeatCreditadoSchema,
  heartbeatSemJogoReconhecidoSchema,
]);
export type HeartbeatResponse = z.infer<typeof heartbeatResponseSchema>;
