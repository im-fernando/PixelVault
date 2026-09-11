/**
 * Superfície pública do módulo `leaderboards`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar leaderboards/domain, leaderboards/application ou
 * leaderboards/infrastructure. A regra é verificada no CI pelo
 * dependency-cruiser. Ver docs/adr/0003.
 *
 * `leaderboards` nasce na M6 (CLAUDE.md), depois da #119 (playtime honesto,
 * ADR 0009) — sem tempo creditado pelo relógio do servidor não há o que
 * ranquear com confiança. Issue #122.
 *
 * O módulo não tem `infrastructure/`: não existe tabela nova, nem Prisma
 * aqui. `user_games` já existe desde a M0 e já é escrita de verdade pela
 * #119; o que faltava era ordenar o que já está lá — uma pergunta, não um
 * dado novo. O dono da tabela (`progress`) responde a pergunta; o dono da
 * conta (`identity`) responde quem é cada linha. `leaderboards` é a camada
 * fina que junta as duas respostas.
 *
 * ## As três decisões desta issue, documentadas aqui porque não têm ADR
 * própria (julgamento: as três já saem justificadas por ADRs existentes —
 * 0006 e 0009 — e o produto ainda não tem "temporada" implementada em lugar
 * nenhum para justificar abrir uma ADR só para dizer que esta issue não a
 * implementa)
 *
 * ### 1. Ranking POR JOGO, não geral da conta
 *
 * BYOR (ADR 0006) só garante "o mesmo jogo" entre duas contas quando o
 * catálogo reconhece o hash de ambas para o mesmo `game_id` — não existe
 * "playtime total da conta" que seja uma comparação honesta entre duas
 * pessoas jogando jogos diferentes. Um ranking geral somaria maçãs com
 * laranjas; um ranking por jogo (`UserGame.totalPlaytimeSeconds` filtrado
 * por `gameId`) compara sempre a mesma coisa. `UserGame` já é modelado por
 * `(userId, gameId)` desde a M0 — este desenho não pede coluna nova.
 *
 * ### 2. Total histórico, sem temporada
 *
 * O README menciona "temporadas" como parte do horizonte da M6, mas nenhuma
 * infraestrutura de corte temporal existe hoje: não há cron (ADR 0019
 * recusou até Redis para um contador, e um fechamento de temporada pede
 * ainda mais — um job que rode num instante certo, zere ou arquive um
 * acumulado, e decida o que "zerar" significa para playtime que é soma
 * cumulativa desde sempre). Implementar temporada sem essa peça seria fingir
 * um fechamento que nada dispara. Esta issue entrega só o total histórico;
 * temporada fica para quando alguém trouxer a infraestrutura de corte (ou
 * decidir que um corte por `WHERE updated_at >= janela` sobre o mesmo
 * `UserGame` basta — mas isso é decisão de outra issue, com a pergunta "o
 * que reseta e quando" respondida antes de escrever código).
 *
 * ### 3. XP fica fora
 *
 * A issue lista XP como possivelmente relacionado, mas não escopo. Esta
 * issue ranqueia só playtime (`UserGame.totalPlaytimeSeconds`, já creditado
 * pela #119) — XP seria outra métrica, com outra regra de crédito, e
 * nenhuma issue ainda decidiu essa regra. Adicionar seria inventar produto
 * sem pedido.
 *
 * ## Comunicação entre módulos, sem cruzar fronteira
 *
 * Uma direção só: `leaderboards` pergunta a `progress` (ranking do jogo,
 * posição da conta) e a `identity` (handle/nome de exibição das contas que
 * aparecem). Nenhum dos dois precisa de nada de `leaderboards` de volta —
 * diferente de `achievements`, que tem evento (`library`/`progress` →
 * `achievements`) E agregação (`achievements` → `library`/`progress`) e por
 * isso passa a agregação pela composition root para não fechar ciclo. Aqui
 * só existe uma direção, então `http/routes.ts` importa
 * `rankingDoJogo`/`posicaoDaContaNoRanking` de `progress/index.js` e
 * `perfisPublicosPorIds` de `identity/index.js` direto — o mesmo padrão de
 * `library` importando `descreverJogos` de `catalog`.
 */
export { leaderboardsRoutes } from './http/routes.js';
export type { OpcoesDeLeaderboards } from './http/routes.js';
export type { LinhaDoRanking } from './domain/linha-do-ranking.js';
export type {
  EntradaDeRanking,
  ObterPerfisPublicos,
  ObterPosicaoDaConta,
  ObterRankingDoJogo,
  PerfilPublico,
} from './domain/portas.js';
