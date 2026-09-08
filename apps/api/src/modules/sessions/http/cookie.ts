import type { CookieSerializeOptions } from '@fastify/cookie';

/**
 * Nome do cookie de sessão.
 *
 * Sem o prefixo `__Host-`, que seria a escolha mais rígida (obriga `Secure`,
 * `Path=/` e proíbe `Domain`), porque ele exige `Secure` sempre — e em
 * desenvolvimento a API roda em `http://localhost`. Ter um nome em produção
 * e outro em desenvolvimento colocaria os dois ambientes em caminhos de
 * código diferentes justamente na peça de autenticação, que é onde a
 * diferença custa mais caro. As três garantias que importam (`httpOnly`,
 * `Secure` fora de dev, `SameSite=Lax`) estão nas opções abaixo.
 */
export const NOME_DO_COOKIE_DE_SESSAO = 'pv_sessao';

/**
 * Atributos do cookie, conforme docs/adr/0017.
 *
 * - `httpOnly`: JavaScript nunca lê o token. Um XSS no front deixa de ser
 *   roubo de sessão silencioso.
 * - `secure`: só sai em HTTPS. Falso apenas em desenvolvimento, porque
 *   `http://localhost` não teria como receber o cookie de volta.
 * - `sameSite: 'lax'`: o cookie acompanha requisições do próprio site
 *   (front e API compartilham o domínio registrável) e fica de fora de POST
 *   disparado por site de terceiro — CSRF clássico morre aqui.
 * - `path: '/'`: uma sessão só para a API inteira.
 * - `signed`: assinado com `SESSION_SECRET`. Não é o que torna o token
 *   inforjável (256 bits aleatórios já fazem isso); serve para descartar
 *   cookie adulterado sem gastar uma consulta ao banco.
 */
export function opcoesDoCookieDeSessao(
  cookieSeguro: boolean,
  expiresAt: Date,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    secure: cookieSeguro,
    sameSite: 'lax',
    path: '/',
    signed: true,
    expires: expiresAt,
  };
}
