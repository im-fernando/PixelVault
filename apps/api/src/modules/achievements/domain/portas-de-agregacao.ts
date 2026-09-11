/**
 * O que o `achievements` precisa perguntar a quem é dono do dado, para as
 * conquistas por agregação — o mesmo desenho de `IdentificarRomNoCatalogo`
 * em `library`: a porta é declarada por quem consome, não importada do tipo
 * de quem responde.
 *
 * ## Por que a composition root injeta isto, em vez de `http/routes.ts`
 * importar `library/index.ts` e `progress/index.ts` direto
 *
 * O evento anda numa direção só (`library`/`progress` → `achievements`, via
 * `avisarPrimeiraRomEnviada` e companhia, importados direto da fachada deles
 * nos respectivos `http/routes.ts` — o mesmo padrão de `identificarRomPorHash`
 * em `library`). A agregação precisa da direção contrária: `achievements`
 * perguntando a `library` e a `progress`. As duas direções ao mesmo tempo, com
 * import direto dos dois lados, seriam uma dependência circular de verdade
 * entre módulos — não só uma regra de lint, um ciclo arquitetural — e o
 * `dependency-cruiser` (`sem-ciclos`, docs/adr/0003) reprovaria o build.
 *
 * Por isso só esta direção (`achievements` ← dados) passa pela composition
 * root: `app.ts` importa `contarRomsNaBiblioteca` de `library` e
 * `agregadoDeJogoDoUsuario` de `progress`, e injeta os dois em
 * `achievementsRoutes` por `opcoes` — a mesma mecânica que já injeta
 * `armazenamento` em `library`/`progress`.
 */

/** Quantas ROMs a conta tem na biblioteca — `library` responde pela fachada. */
export type ContarRomsNaBiblioteca = (userId: string) => Promise<number>;

/** O que `progress` sabe sobre o jogo daquela conta, agregado. */
export interface AgregadoDeJogoDoUsuario {
  /** Quantos jogos distintos ela já jogou — linhas de `user_games`. */
  readonly jogosDistintos: number;
  /**
   * Soma de `UserGame.totalPlaytimeSeconds` — sempre `0` até a #119 escrever
   * playtime de verdade. Ver o comentário de `domain/agregacao.ts`.
   */
  readonly segundosJogados: number;
}

export type ObterAgregadoDeJogoDoUsuario = (userId: string) => Promise<AgregadoDeJogoDoUsuario>;
