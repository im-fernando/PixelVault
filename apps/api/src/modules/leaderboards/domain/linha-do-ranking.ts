/**
 * Uma linha do ranking, já pronta para a resposta HTTP: o número que
 * `progress` sabe (playtime, posição) e o nome que `identity` sabe (handle,
 * nome de exibição), juntos. Nenhum dos dois módulos sabe montar isto
 * sozinho — é por isso que `leaderboards` existe como módulo à parte, e não
 * como mais uma rota dentro de um dos dois.
 */
export interface LinhaDoRanking {
  userId: string;
  handle: string;
  displayName: string;
  totalPlaytimeSeconds: number;
  posicao: number;
}
