import { randomUUID } from 'node:crypto';
import type { SessionRepository } from '../domain/session-repository.js';
import { calcularExpiracao } from '../domain/sessao.js';
import { truncarIp } from '../domain/ip-truncado.js';

/** Corta o user-agent antes de gravar: a coluna é texto livre vindo do cliente. */
const TAMANHO_MAXIMO_USER_AGENT = 255;

export interface DependenciasDeAbertura {
  sessoes: SessionRepository;
  /** Token opaco em claro — só o cliente fica com ele. */
  gerarToken: () => string;
  hashDoToken: (token: string) => string;
  agora: () => Date;
}

export interface Dispositivo {
  userAgent: string | null;
  ip: string | null;
}

export interface SessaoAberta {
  /** Vai para o cookie e some daqui. Nunca é gravado nem logado. */
  token: string;
  expiresAt: Date;
}

/**
 * Abre uma sessão nova para um usuário.
 *
 * Sempre nova, nunca reaproveitada — é assim que a fixação de sessão morre
 * sem precisar de um passo de "regenerar identificador": não existe sessão
 * anônima no servidor para alguém plantar antes do login, e cada login
 * produz um token que nunca existiu. Ver docs/adr/0017.
 */
export async function abrirSessao(
  deps: DependenciasDeAbertura,
  userId: string,
  dispositivo: Dispositivo,
): Promise<SessaoAberta> {
  const token = deps.gerarToken();
  const expiresAt = calcularExpiracao(deps.agora());

  await deps.sessoes.criar({
    id: randomUUID(),
    userId,
    tokenHash: deps.hashDoToken(token),
    expiresAt,
    userAgent: dispositivo.userAgent?.slice(0, TAMANHO_MAXIMO_USER_AGENT) ?? null,
    ipTruncated: truncarIp(dispositivo.ip),
  });

  return { token, expiresAt };
}
