import type { CodigoDeConquista } from './conquista-desbloqueada.js';

/**
 * As conquistas por agregação da M6 — ADR 0010. Três famílias, três tiers
 * cada, e a mesma forma para todas: um limiar mínimo e o código que ele
 * desbloqueia.
 *
 * O cálculo é puro de propósito (sem banco, sem Prisma): dado o número atual
 * da conta, esta função só decide quais códigos DEVERIAM estar desbloqueados
 * — quem persiste é a aplicação, com o repositório.
 */
export interface LimiarDeConquista {
  readonly code: CodigoDeConquista;
  readonly minimo: number;
}

/**
 * Tamanho da coleção — quantas ROMs a conta tem na biblioteca
 * (`UserRomRepository.medirUso(userId).quantidade`, pergunta ao `library`
 * pela fachada). Os números (10/50/100) ficam bem abaixo do teto de
 * `COTA_DE_ROMS_POR_CONTA` (1500): a conquista celebra o hábito de colecionar,
 * não o limite da conta.
 */
export const LIMIARES_DE_COLECAO: readonly LimiarDeConquista[] = [
  { code: 'colecionista_bronze', minimo: 10 },
  { code: 'colecionista_prata', minimo: 50 },
  { code: 'colecionista_ouro', minimo: 100 },
];

/**
 * Jogos distintos jogados — quantas linhas de `user_games` a conta tem
 * (uma por jogo já jogado, pergunta ao `progress` pela fachada). Números bem
 * menores que os de coleção: ter a ROM não é ter jogado, e o objetivo aqui é
 * outro — variedade de uso, não tamanho de acervo.
 */
export const LIMIARES_DE_JOGOS_DISTINTOS: readonly LimiarDeConquista[] = [
  { code: 'explorador_bronze', minimo: 5 },
  { code: 'explorador_prata', minimo: 20 },
  { code: 'explorador_ouro', minimo: 50 },
];

/**
 * Horas jogadas — soma de `UserGame.totalPlaytimeSeconds` da conta.
 *
 * ## O ponto de ligação pendente (issue #119)
 *
 * `totalPlaytimeSeconds` existe no schema desde a M4, mas nenhum código
 * escreve nele de verdade ainda — a #119 (playtime honesto, possivelmente em
 * paralelo com esta issue) é quem vai passar a credenciar tempo jogado pelo
 * relógio do servidor. Até ela chegar, `agregadoDeJogoDoUsuario` (módulo
 * `progress`) sempre devolve `segundosJogados: 0`, e nenhuma destas três
 * conquistas desbloqueia — o que é esperado, não bug: a conta não jogou
 * hora nenhuma que o servidor tenha certificado. No dia em que a #119
 * escrever valores reais, esta lista passa a valer sem precisar mudar uma
 * linha aqui.
 */
export const LIMIARES_DE_HORAS_JOGADAS: readonly LimiarDeConquista[] = [
  { code: 'dedicacao_bronze', minimo: 1 * 60 * 60 },
  { code: 'dedicacao_prata', minimo: 10 * 60 * 60 },
  { code: 'dedicacao_ouro', minimo: 50 * 60 * 60 },
];

/** Os códigos, dentre os limiares informados, que `valor` já alcança. */
export function codigosAlcancados(
  valor: number,
  limiares: readonly LimiarDeConquista[],
): CodigoDeConquista[] {
  return limiares.filter((limiar) => valor >= limiar.minimo).map((limiar) => limiar.code);
}
