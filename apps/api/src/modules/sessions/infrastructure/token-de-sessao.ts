import { createHash, randomBytes } from 'node:crypto';

/**
 * 32 bytes (256 bits) de aleatoriedade criptográfica. O token não carrega
 * informação nenhuma — não é um JWT, não tem `userId` dentro, não tem
 * estrutura para adivinhar. Quem o tem, tem a sessão; quem não o tem, não
 * chega perto por força bruta.
 */
const BYTES_DO_TOKEN = 32;

export function gerarTokenDeSessao(): string {
  return randomBytes(BYTES_DO_TOKEN).toString('base64url');
}

/**
 * SHA-256, e não Argon2, de propósito: o token já é 256 bits aleatórios, não
 * uma senha curta escolhida por gente. Não existe dicionário para atacar, e
 * o hash lento aqui só custaria latência em toda requisição autenticada.
 *
 * Hex minúsculo porque é o que vai para a coluna `token_hash`, que tem índice
 * único — a busca por sessão é uma leitura por chave.
 */
export function hashDoToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
