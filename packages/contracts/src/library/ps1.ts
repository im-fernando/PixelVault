/** Teto de um disco PS1; cartuchos continuam com suas faixas específicas. */
export const TAMANHO_MAXIMO_DE_PS1_EM_BYTES = 1024 * 1024 * 1024;
export const EXTENSOES_DE_PS1 = ['chd', 'iso', 'exe'] as const;

/**
 * Triagem estrutural, compartilhada pelo upload e runtime. O core ainda valida
 * o conteúdo do disco. CHD de CD não identifica sozinho qual console o gravou.
 * `inicio` contém até os primeiros 64 KiB; `tamanho` é o tamanho real do arquivo.
 */
export function erroNaImagemPs1(inicio: Uint8Array, tamanho: number, nome: string): string | null {
  const extensao = nome.split('.').at(-1)?.toLowerCase();
  if (!EXTENSOES_DE_PS1.some((ext) => ext === extensao))
    return 'PS1 aceita CHD de disco único, ISO de setores de 2048 bytes e homebrew PS-X EXE. Converta BIN/CUE para CHD; PBP e troca de discos ainda não são suportados.';
  if (tamanho > TAMANHO_MAXIMO_DE_PS1_EM_BYTES) return 'O arquivo de PS1 excede o limite de 1 GiB.';
  const texto = (offset: number, valor: string) =>
    [...valor].every((c, i) => inicio[offset + i] === c.charCodeAt(0));
  const view = new DataView(inicio.buffer, inicio.byteOffset, inicio.byteLength);
  if (extensao === 'chd') {
    if (inicio.length < 124 || tamanho < 124 || !texto(0, 'MComprHD'))
      return 'CHD inválido ou truncado.';
    if (view.getUint32(8) !== 124 || view.getUint32(12) !== 5)
      return 'Use CHD versão 5, criado a partir do CD completo.';
    const unidade = view.getUint32(60);
    const bloco = view.getUint32(56);
    const logicos = view.getBigUint64(32);
    const mapa = view.getBigUint64(40);
    if (
      ![2352, 2448].includes(unidade) ||
      bloco === 0 ||
      bloco > 16 * 1024 * 1024 ||
      bloco % unidade !== 0 ||
      logicos < BigInt(unidade) ||
      logicos % BigInt(unidade) !== 0n ||
      mapa < 124n ||
      mapa >= BigInt(tamanho)
    )
      return 'O CHD não contém uma imagem completa de CD suportada.';
    if (inicio.subarray(104, 124).some((byte) => byte !== 0))
      return 'CHD diferencial depende de outro arquivo. Envie um CHD independente.';
    return null;
  }
  if (extensao === 'iso') {
    if (
      tamanho % 2048 !== 0 ||
      inicio.length < 32768 + 2048 ||
      inicio[32768] !== 1 ||
      !texto(32769, 'CD001') ||
      inicio[32774] !== 1 ||
      !texto(32776, 'PLAYSTATION')
    )
      return 'ISO inválida: esperado um disco PlayStation com setores de 2048 bytes. Para múltiplas faixas, use CHD.';
    const setores = view.getUint32(32768 + 80, true);
    if (setores === 0 || setores * 2048 > tamanho) return 'A imagem ISO está truncada.';
    return null;
  }
  if (inicio.length < 2048 || !texto(0, 'PS-X EXE'))
    return 'O executável não é um homebrew PS-X EXE.';
  const carga = view.getUint32(0x18, true) & 0x1fffffff;
  const bytes = view.getUint32(0x1c, true);
  const entrada = view.getUint32(0x10, true) & 0x1fffffff;
  if (
    bytes === 0 ||
    bytes + 2048 > tamanho ||
    carga + bytes > 2 * 1024 * 1024 ||
    entrada < carga ||
    entrada >= carga + bytes
  )
    return 'PS-X EXE truncado ou com endereço de execução inválido.';
  return null;
}
