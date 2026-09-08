import type { SystemId } from '@pixelvault/contracts';

/**
 * A convenção de nome do `libretro-thumbnails`, duplicada do lado do front.
 *
 * É a mesma convenção que `apps/api/src/modules/catalog/infrastructure/nomes-no-libretro.ts`
 * já resolve para o catálogo público (issue #77): mesma playlist por sistema,
 * mesma lista de regiões tentadas em ordem, mesma troca de caracteres
 * reservados. Não é importada de lá de propósito — `nomes-no-libretro.ts` do
 * backend mora em `apps/api`, módulo `catalog`, e este arquivo mora em
 * `apps/web`. Não existe hoje um pacote compartilhado entre as duas apps para
 * este tipo de coisa, e criar um só para isto seria infraestrutura demais
 * para uma feature de desenvolvimento como a biblioteca pessoal local (ver
 * `LocalLibrary.tsx`) — que, por sinal, nem fala com a API: a lombada dela é
 * resolvida inteiramente no navegador, direto do `thumbnails.libretro.com`.
 *
 * Se um dia mais alguma coisa precisar atravessar `apps/api` ↔ `apps/web`
 * repetidamente, aí sim vale extrair um pacote. Por ora, duas cópias pequenas
 * e comentadas são mais baratas que uma dependência nova entre as duas apps.
 *
 * Ver o arquivo de origem para a explicação completa da convenção (estrutura
 * do repositório do libretro-thumbnails, por que sufixo de região, por que
 * lista de candidatos em vez de busca).
 */

const BASE_URL = 'https://thumbnails.libretro.com';

/** A playlist do RetroArch de cada console que o PixelVault suporta. */
const PLAYLIST_POR_SISTEMA: Record<SystemId, string> = {
  snes: 'Nintendo - Super Nintendo Entertainment System',
  nes: 'Nintendo - Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gba: 'Nintendo - Game Boy Advance',
  genesis: 'Sega - Mega Drive - Genesis',
};

/** As regiões tentadas, em ordem — mesma ordem e mesmo motivo do backend. */
const REGIOES = [
  '',
  ' (USA)',
  ' (World)',
  ' (USA, Europe)',
  ' (Europe)',
  ' (Japan, USA)',
  ' (Japan)',
];

/** Os caracteres que o libretro troca por `_` no nome do arquivo. */
const RESERVADOS = /[&*/:`<>?\\|]/g;

/** Aplica a troca de caracteres reservados do libretro. */
function nomeDeArquivoNoLibretro(nome: string): string {
  return nome.replace(RESERVADOS, '_');
}

/**
 * As URLs de lombada a tentar, em ordem, para um jogo da biblioteca local.
 *
 * Devolve lista vazia para título em branco: não faz sentido pedir
 * `/Named_Boxarts/.png` ao servidor.
 */
export function urlsCandidatasDeLombada(titulo: string, systemId: SystemId): string[] {
  const tituloLimpo = titulo.trim();
  if (tituloLimpo.length === 0) return [];

  const playlist = PLAYLIST_POR_SISTEMA[systemId];

  return REGIOES.map((regiao) => {
    const arquivo = nomeDeArquivoNoLibretro(`${tituloLimpo}${regiao}`);
    return `${BASE_URL}/${encodeURIComponent(playlist)}/Named_Boxarts/${encodeURIComponent(arquivo)}.png`;
  });
}
