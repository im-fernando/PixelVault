import { createHash, randomBytes } from 'node:crypto';

/**
 * 32 bytes (256 bits) de aleatoriedade criptográfica, o mesmo tamanho do
 * token de sessão. Aqui o número importa ainda mais: este token **é** a
 * prova de identidade de quem esqueceu a senha, então adivinhar um é entrar
 * numa conta sem nunca ter sabido a senha dela.
 *
 * `randomBytes` e não `Math.random` nem um UUID: o primeiro é previsível por
 * construção, e o segundo, mesmo na versão 4, é aleatoriedade com formato
 * conhecido e 122 bits — sem falar que UUID vaza em log e em URL sem
 * ninguém desconfiar, porque parece um id.
 */
const BYTES_DO_TOKEN = 32;

export function gerarTokenDeRecuperacao(): string {
  return randomBytes(BYTES_DO_TOKEN).toString('base64url');
}

/**
 * SHA-256, pelo mesmo motivo do token de sessão: o valor já é 256 bits
 * aleatórios, não uma senha curta escolhida por gente, então não existe
 * dicionário a atacar e um Argon2 aqui só custaria latência.
 *
 * O que o hash garante é o que a issue pede: um dump de
 * `password_reset_tokens` não vira redefinição de senha alheia, porque o
 * valor que abre a porta nunca esteve no banco.
 */
export function hashDoTokenDeRecuperacao(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
