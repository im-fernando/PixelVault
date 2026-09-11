/**
 * Superfície pública do módulo `profiles`.
 *
 * Este arquivo é a ÚNICA porta de entrada do módulo — nenhum outro módulo
 * pode importar profiles/domain, profiles/application ou profiles/http
 * diretamente. A regra é verificada no CI pelo dependency-cruiser. Ver
 * docs/adr/0003.
 *
 * `profiles` nasce na M6 (issue #123) — o perfil público `/u/:handle` que o
 * `handle` reserva desde a M2 (`identity/domain/handle.ts`) sempre planejou.
 * Depende de conquistas (#120/#121) e de leaderboard (#122) para ter o que
 * mostrar.
 *
 * O módulo não tem `infrastructure/`: não existe tabela nova, nem Prisma
 * aqui — mesmo raciocínio de `leaderboards`. `identity` já é dono da conta e
 * do handle; `achievements`, das conquistas; `progress`, do playtime e dos
 * jogos distintos (`UserGame`). O que faltava era juntar os três numa
 * resposta só — uma pergunta, não um dado novo.
 *
 * ## O que aparece, e o que nunca aparece
 *
 * Nome de exibição, conquistas desbloqueadas e estatística agregada
 * (playtime e jogos distintos). NUNCA a biblioteca de ROMs — ela é privada
 * (BYOR, ADR 0006), e conquista/estatística é metadado agregado, não o
 * acervo em si. NUNCA o e-mail, pelo mesmo raciocínio de `PerfilPublico` em
 * `identity`.
 *
 * ## Decisão: sem posição de ranking no perfil
 *
 * A #122 decidiu ranking POR JOGO, não geral da conta (ver o cabeçalho de
 * `leaderboards/index.ts`) — não existe "a posição desta pessoa" sem dizer
 * em qual jogo. Sintetizar uma posição geral inventaria um conceito que a
 * #122 decidiu não ter. O perfil mostra playtime e jogos distintos
 * agregados (o mesmo raciocínio de `agregadoDeJogoDoUsuario` em
 * `achievements`), e quem quiser a posição num jogo específico já tem
 * `GET /api/leaderboards/games/:gameId`.
 *
 * ## Sem sessão, sem CASL
 *
 * Mesmo padrão do catálogo público (`catalogRoutes`, `GET /games/:slug`):
 * dado público não pede pergunta de autorização — não há regra de
 * `Profile` público em `habilidades.ts`, porque não há nada a negar aqui.
 *
 * ## Comunicação entre módulos, sem cruzar fronteira
 *
 * Uma direção só: `profiles` pergunta a `identity` (o handle), a
 * `achievements` (as conquistas) e a `progress` (o agregado). Nenhum dos
 * três precisa de nada de `profiles` de volta — é uma tela de leitura
 * agregada, terminal, ninguém depende dela —, então não há ciclo real para
 * o `dependency-cruiser` reprovar, e `http/routes.ts` importa as três
 * funções direto das fachadas correspondentes, sem passar pela composition
 * root. O mesmo padrão de `leaderboards` importando `progress`/`identity`.
 */
export { profilesRoutes } from './http/routes.js';
