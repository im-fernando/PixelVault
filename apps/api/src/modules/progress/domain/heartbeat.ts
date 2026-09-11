/**
 * Quantos segundos um heartbeat credita, dado o relógio do servidor — a
 * regra 1 do [ADR 0009](../../../../../../docs/adr/0009-modelo-de-confianca-do-playtime.md).
 *
 * `ultimoHeartbeatEm: null` é "nunca creditamos nada para este jogo antes":
 * sem um instante anterior não há intervalo para medir, então este primeiro
 * heartbeat só estabelece o marco (quem chama grava `agora` como o novo
 * `lastPlayedAt`) e credita zero. É o mesmo raciocínio que protege contra o
 * hiato de aba oculta — só que aplicado ao início de uma sessão nova.
 *
 * `agora` sempre vem de quem chama, nunca de dentro desta função: ela não lê
 * relógio nenhum, para o teste poder fixar os dois lados e a função inteira
 * ficar determinística. O `agora` em si já é o relógio do SERVIDOR — nunca um
 * timestamp que o corpo da requisição declarou (o contrato não aceita um).
 *
 * `Math.max(0, ...)` é defesa contra relógio do servidor andar para trás
 * (ajuste de NTP, o tipo de coisa que não deveria acontecer e que esta função
 * não pode custar a ignorar): um intervalo negativo nunca credita playtime
 * negativo, que decrementaria o total de alguém sem motivo.
 */
export function calcularCreditoDoHeartbeat(
  ultimoHeartbeatEm: Date | null,
  agora: Date,
  tetoSegundos: number,
): number {
  if (ultimoHeartbeatEm === null) return 0;

  const decorridosSegundos = Math.floor((agora.getTime() - ultimoHeartbeatEm.getTime()) / 1000);
  return Math.max(0, Math.min(decorridosSegundos, tetoSegundos));
}
