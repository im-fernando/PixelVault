import type { LibraryRom } from '@pixelvault/contracts';

export type OrdemDaBiblioteca = 'original' | 'titulo' | 'tamanho';

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR');
}

export function filtrarBiblioteca(
  roms: readonly LibraryRom[],
  busca: string,
  soFavoritos: boolean,
  ordem: OrdemDaBiblioteca,
): LibraryRom[] {
  const termos = normalizar(busca).trim().split(/\s+/).filter(Boolean);
  const resultado = roms.filter((rom) => {
    const texto = normalizar(`${rom.title} ${rom.fileName}`);
    return (!soFavoritos || rom.isFavorite) && termos.every((termo) => texto.includes(termo));
  });

  return resultado.sort((a, b) => {
    if (ordem === 'titulo') return a.title.localeCompare(b.title, 'pt-BR');
    if (ordem === 'tamanho') return b.sizeBytes - a.sizeBytes;
    return Number(b.isFavorite) - Number(a.isFavorite);
  });
}
