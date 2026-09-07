/**
 * A geometria da tela do console, separada do React.
 *
 * Fica fora do componente porque é a única parte do player que dá para errar
 * em silêncio: uma imagem esticada não quebra nada, só fica feia — e ninguém
 * escreve teste para o que não quebra. Aqui é função pura, e portanto testada.
 */

/** Resolução de saída do SNES: 256×224, que é exatamente 8:7. */
export const RESOLUCAO_NATIVA = Object.freeze({ largura: 256, altura: 224 });

/**
 * As duas proporções que fazem sentido para um console de tubo.
 *
 * `8:7` é o pixel quadrado — a imagem como o framebuffer a descreve. `4:3` é
 * como a televisão da época esticava esse mesmo framebuffer, e é o que a
 * maioria das pessoas lembra. Não há resposta certa, por isso é escolha do
 * usuário e não constante escondida no código.
 */
export const PROPORCOES = Object.freeze({
  '8:7': 8 / 7,
  '4:3': 4 / 3,
});

export type ProporcaoDeTela = keyof typeof PROPORCOES;

export const PROPORCOES_DISPONIVEIS: readonly ProporcaoDeTela[] = ['4:3', '8:7'];

export interface Dimensoes {
  readonly largura: number;
  readonly altura: number;
}

export interface OpcoesDeExibicao {
  /**
   * Arredonda a altura para um múltiplo inteiro da resolução nativa.
   *
   * É o que elimina a linha de espessura dupla que aparece quando 224 pixels
   * são espalhados por 500: com escala inteira, cada pixel do console vira
   * exatamente N pixels da tela.
   */
  readonly escalaInteira?: boolean;
  readonly alturaNativa?: number;
}

/**
 * Maior retângulo com a proporção pedida que cabe no espaço disponível.
 *
 * Devolve zero quando não há espaço: o componente monta antes de o layout
 * existir, e um canvas de tamanho negativo é erro de DOM.
 */
export function calcularAreaDeExibicao(
  disponivel: Dimensoes,
  proporcao: ProporcaoDeTela,
  opcoes: OpcoesDeExibicao = {},
): Dimensoes {
  const razao = PROPORCOES[proporcao];
  const larguraDisponivel = Math.max(0, Math.floor(disponivel.largura));
  const alturaDisponivel = Math.max(0, Math.floor(disponivel.altura));
  if (larguraDisponivel === 0 || alturaDisponivel === 0) {
    return { largura: 0, altura: 0 };
  }

  const limitadoPelaLargura = larguraDisponivel / razao <= alturaDisponivel;
  let altura = limitadoPelaLargura ? larguraDisponivel / razao : alturaDisponivel;

  if (opcoes.escalaInteira === true) {
    const alturaNativa = opcoes.alturaNativa ?? RESOLUCAO_NATIVA.altura;
    // Mínimo de 1×: em tela pequena, uma imagem um pouco maior que o espaço é
    // pior que uma imagem sem escala inteira, mas imagem nenhuma é pior ainda.
    const escala = Math.max(1, Math.floor(altura / alturaNativa));
    altura = escala * alturaNativa;
  }

  return { largura: Math.round(altura * razao), altura: Math.round(altura) };
}
