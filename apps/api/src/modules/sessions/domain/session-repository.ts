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
}
