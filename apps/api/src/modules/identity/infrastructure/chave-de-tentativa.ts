import { createHmac } from 'node:crypto';

/**
 * Um e-mail cabe em 254 caracteres (RFC 5321) e um IP em muito menos. O corte
 * existe porque a chave é calculada antes da validação do corpo: sem ele,
 * bastaria mandar um "e-mail" de um megabyte para fazer o servidor hashear um
 * megabyte por requisição.
 */
const TAMANHO_MAXIMO = 320;

/**
 * A chave que vai para `auth_attempts`: HMAC-SHA256 do IP ou do
 * identificador tentado.
 *
 * Guardar o valor em claro seria construir, de graça, duas listas que não
 * queremos ter: a de quem estava sendo atacado (e-mails tentados, existam ou
 * não como conta) e a de quem tentou (IPs). A contagem só precisa de
 * igualdade, e HMAC preserva igualdade.
 *
 * HMAC, e não SHA-256 puro, porque e-mail e IPv4 têm entropia baixa demais:
 * um dicionário de e-mails ou os 2^32 endereços possíveis quebram um hash
 * sem segredo em minutos. Com o segredo do servidor no meio, quem só tem a
 * tabela não reverte nada — e quem tem uma suspeita concreta ainda pode
 * calcular a chave de um e-mail específico para investigá-lo.
 *
 * O segredo é o `SESSION_SECRET`, que a aplicação já exige. Ele rotacionar
 * não quebra nada: as chaves antigas deixam de casar, os contadores em curso
 * zeram e a janela seguinte recomeça — no pior caso, perdoa um bloqueio em
 * andamento.
 */
export function chaveDeTentativa(segredo: string, valor: string): string {
  return createHmac('sha256', segredo).update(valor.slice(0, TAMANHO_MAXIMO)).digest('hex');
}
