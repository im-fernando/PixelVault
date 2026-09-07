/**
 * Nome de exibição derivado do handle, para quando a pessoa não informa um.
 *
 * O handle é kebab-case por contrato (`joao-silva`), então cada bloco vira
 * uma palavra capitalizada: `Joao Silva`. Não tentamos adivinhar acento nem
 * sobrenome — é só um padrão apresentável enquanto ninguém o troca, e trocar
 * é `User.renomear`.
 */
export function derivarDisplayNameDoHandle(handle: string): string {
  return handle
    .split('-')
    .map((bloco) => bloco.charAt(0).toUpperCase() + bloco.slice(1))
    .join(' ');
}
