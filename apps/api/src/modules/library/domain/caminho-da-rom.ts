/**
 * Onde a ROM mora depois de verificada.
 *
 * O caminho é `roms/<sha256>` — endereçamento por conteúdo, decidido na
 * [ADR 0013](../../../../../../docs/adr/0013-enderecar-roms-pelo-conteudo.md).
 * Um objeto por conteúdo, e não um por usuário: quinhentas pessoas com o mesmo
 * jogo ocupam um arquivo, não quinhentos.
 *
 * O objeto **não carrega dono**, e é isso que torna a montagem desta chave
 * delicada: quem escreve em `roms/<x>` escreve na ROM de todo mundo que tem o
 * conteúdo `x`. Por isso o único hash que pode chegar aqui é o que o servidor
 * calculou lendo os bytes da quarentena
 * ([ADR 0014](../../../../../../docs/adr/0014-verificar-a-rom-em-quarentena-antes-de-promover.md)),
 * nunca o que o cliente informou no pedido de upload — lá ele é dica, e só.
 *
 * Como em `quarentena.ts`, o formato é conferido antes de virar caminho. Hoje
 * não pode falhar, porque o argumento vem de um `createHash`; a checagem é a
 * rede embaixo, para o dia em que alguém montar a chave a partir de outra
 * coisa.
 */

/** Prefixo do acervo compartilhado por conteúdo. Nunca `quarentena/`. */
export const PREFIXO_DAS_ROMS = 'roms';

const SHA256 = /^[a-f0-9]{64}$/;

export function caminhoDaRom(sha256: string): string {
  if (!SHA256.test(sha256)) {
    throw new TypeError(
      'Caminho de ROM só se monta com SHA-256 hexadecimal — ver caminho-da-rom.ts',
    );
  }

  return `${PREFIXO_DAS_ROMS}/${sha256}`;
}
