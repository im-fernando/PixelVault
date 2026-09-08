import type { SystemId } from '@pixelvault/contracts';

/**
 * O que dá para saber de um arquivo antes de mandá-lo para o acervo.
 *
 * Nada aqui **decide** coisa alguma: quem diz se um arquivo é uma ROM é a
 * verificação do servidor, que lê os bytes da quarentena depois do envio
 * (docs/adr/0014). O que este módulo faz é dar à interface o suficiente para
 * conversar com a pessoa — sugerir o que abrir no seletor de arquivo, chamar o
 * cartucho pelo nome e calcular a dica de hash — sem nunca afirmar o que só o
 * servidor pode afirmar.
 */

/**
 * As extensões que o seletor de arquivo sugere, por sistema.
 *
 * É **cópia deliberada** da faixa que a verificação do servidor aceita, e não
 * um contrato compartilhado, porque aqui ela não vale como regra: serve para o
 * diálogo de arquivo abrir já filtrado e para a mensagem de recusa dizer o que
 * era esperado. Se a lista de lá crescer e esta ficar para trás, o pior que
 * acontece é a pessoa precisar trocar o filtro para "todos os arquivos" — o
 * envio em si continua funcionando, porque quem julga é o outro lado. Promover
 * isto a contrato seria dar peso de regra a uma dica de interface.
 */
export const EXTENSOES_POR_SISTEMA: Readonly<Record<SystemId, readonly string[]>> = {
  snes: ['sfc', 'smc', 'fig', 'swc'],
  nes: ['nes'],
  gb: ['gb', 'gbc'],
  gba: ['gba'],
  genesis: ['md', 'gen', 'bin', 'smd'],
};

/** O `accept` do input, no formato que o navegador espera. */
export const EXTENSOES_ACEITAS: readonly string[] = Object.values(EXTENSOES_POR_SISTEMA)
  .flat()
  .map((extensao) => `.${extensao}`);

/** De que console a extensão diz que o arquivo é. Nulo quando não diz nada. */
export function sistemaPelaExtensao(nomeDoArquivo: string): SystemId | null {
  const ponto = nomeDoArquivo.lastIndexOf('.');
  if (ponto <= 0 || ponto === nomeDoArquivo.length - 1) return null;

  const extensao = nomeDoArquivo.slice(ponto + 1).toLowerCase();
  for (const [sistema, extensoes] of Object.entries(EXTENSOES_POR_SISTEMA)) {
    if (extensoes.includes(extensao)) return sistema as SystemId;
  }
  return null;
}

/**
 * O nome do arquivo virado título de etiqueta.
 *
 * Tira a extensão e os separadores que nome de dump costuma carregar, porque a
 * etiqueta é para ler, não para copiar caminho. O nome de verdade continua
 * indo inteiro para o servidor — é ele que fica em `user_roms.file_name`.
 */
export function tituloDoArquivo(nomeDoArquivo: string): string {
  const ponto = nomeDoArquivo.lastIndexOf('.');
  const semExtensao = ponto > 0 ? nomeDoArquivo.slice(0, ponto) : nomeDoArquivo;
  return semExtensao.replace(/[_.]+/g, ' ').trim() || nomeDoArquivo;
}

/**
 * O SHA-256 do arquivo, calculado aqui no navegador.
 *
 * É **dica**, e a palavra é do contrato: ela vai no pedido de upload só para o
 * servidor poder responder "você já tem esse conteúdo" antes de qualquer byte
 * trafegar. Não decide caminho, não prova nada, e mentir nela não alcança
 * ninguém — o hash que endereça o objeto é o que o servidor calcula depois de
 * ler a quarentena (docs/adr/0014).
 *
 * É o hash do arquivo **inteiro**, como ele será enviado, e é isso que o faz
 * casar com `user_roms.sha256`. O hash sem os 512 bytes de cabeçalho de
 * copiador do SNES — que a biblioteca local de desenvolvimento guarda em
 * `sha256SemHeader` — não serve aqui: ele existe para casar com as bases de
 * metadado (No-Intro), e esse cruzamento é do servidor, dentro do `catalog`.
 *
 * Lê o arquivo inteiro na memória porque a WebCrypto não tem digest
 * incremental, e o teto de 64 MiB do contrato mantém isso dentro do razoável.
 * `crypto.subtle` exige contexto seguro: `localhost` e HTTPS têm, e não há um
 * terceiro caso onde o produto rode.
 */
export async function sha256DoArquivo(arquivo: Blob): Promise<string> {
  const resumo = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
  return Array.from(new Uint8Array(resumo), (byte) => byte.toString(16).padStart(2, '0')).join('');
}
