import type { SessaoAtiva } from './sessao.js';

/**
 * Uma sessão nova, pronta para gravar. O token em claro não está aqui de
 * propósito — quem persiste só conhece o hash. Ver docs/adr/0017.
 */
export interface DadosDeAbertura {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string | null;
  ipTruncated: string | null;
}

/**
 * Uma sessão como ela aparece para o próprio dono na listagem.
 *
 * Sem `tokenHash` e sem `expiresAt`: o primeiro nunca sai do banco, e o
 * segundo não tem por que sair porque sessão expirada não chega a ser
 * listada — a limpeza preguiçosa apaga antes. Ver `application/listar-sessoes.ts`.
 */
export interface SessaoDoUsuario {
  id: string;
  userAgent: string | null;
  ipTruncated: string | null;
  createdAt: Date;
  lastSeenAt: Date;
}

/**
 * Porta de persistência do `sessions`.
 *
 * Repare no que ela não tem: nada sobre usuário além de um `userId` que é
 * string opaca. Este módulo não sabe o que é um `User`, não valida e-mail e
 * não conhece senha — ele guarda e devolve sessões. É isso que permite
 * `library` e `progress` reusarem a resolução de sessão sem arrastar
 * `identity` junto.
 */
export interface SessionRepository {
  criar(dados: DadosDeAbertura): Promise<void>;
  buscarPorTokenHash(tokenHash: string): Promise<SessaoAtiva | null>;
  /**
   * Empurra a expiração e marca o uso. Um UPDATE só, porque a renovação
   * deslizante mexe nas duas colunas ao mesmo tempo — `lastSeenAt` sem
   * `expiresAt` seria escrita por requisição, que é o que a ADR evita.
   */
  renovar(id: string, expiresAt: Date, lastSeenAt: Date): Promise<void>;
  /** As sessões vivas do usuário, da usada mais recentemente para a mais antiga. */
  listarDoUsuario(userId: string): Promise<SessaoDoUsuario[]>;
  /**
   * Apaga uma sessão do usuário. `true` quando apagou.
   *
   * O `userId` é parâmetro, e não uma checagem que quem chama faz depois de
   * ler a linha, de propósito: ele entra no mesmo `WHERE` do `id`. Com isso,
   * "essa sessão não existe" e "essa sessão existe mas é de outra pessoa"
   * não são dois caminhos que alguém possa acabar tratando diferente — são
   * literalmente a mesma consulta devolvendo zero linhas. É assim que o
   * `DELETE /api/auth/sessions/:id` consegue responder 404 nos dois casos
   * sem depender de disciplina de quem escreve a rota.
   */
  revogar(id: string, userId: string): Promise<boolean>;
  /** Apaga todas as sessões do usuário menos uma. Devolve quantas caíram. */
  revogarOutras(userId: string, sessaoPreservada: string): Promise<number>;
  /**
   * Apaga TODAS as sessões do usuário, sem exceção. Devolve quantas caíram.
   *
   * Método próprio, e não `revogarOutras(userId, '')`: passar um id que não
   * existe para "preserve este" produziria o mesmo `DELETE`, e é justamente
   * essa a coincidência perigosa — um dia o id vazio vira o id de alguém, ou
   * alguém lê a chamada e acha que é engano. As duas operações têm
   * autorizações diferentes (uma exige sessão, a outra acontece sem
   * nenhuma), então têm nomes diferentes.
   */
  revogarTodas(userId: string): Promise<number>;
  /**
   * Limpeza preguiçosa: apaga as sessões já vencidas deste usuário. Ver
   * `application/listar-sessoes.ts` para o porquê de não haver cron.
   */
  apagarExpiradas(userId: string, agora: Date): Promise<number>;
}
