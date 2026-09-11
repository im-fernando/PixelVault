/**
 * `totalPlaytimeSeconds` num texto curto — "3h 20min", "12min", "menos de 1min".
 * O ranking mostra tempo jogado, não segundos crus: ninguém lê "12045s" e
 * entende quanto jogou.
 */
export function formatarPlaytime(totalSegundos: number): string {
  const horas = Math.floor(totalSegundos / 3600);
  const minutos = Math.floor((totalSegundos % 3600) / 60);

  if (horas === 0 && minutos === 0) return 'menos de 1min';
  if (horas === 0) return `${minutos}min`;
  if (minutos === 0) return `${horas}h`;
  return `${horas}h ${minutos}min`;
}
