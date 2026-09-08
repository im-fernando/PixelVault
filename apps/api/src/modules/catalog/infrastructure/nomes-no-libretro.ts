import type { SystemId } from '@pixelvault/contracts';
import type { JogoSemCapa } from '../domain/busca-de-capa.js';

/**
 * A convenção de nome do `libretro-thumbnails`, num arquivo só.
 *
 * Está separada do adaptador de rede de propósito: isto aqui é string, não
 * I/O, e é a parte que dá para conferir sem sair do processo. O adaptador
 * cuida de HTTP, cache e tempo; este arquivo cuida de "como se chama o arquivo
 * da capa de tal jogo em tal console".
 *
 * ## A estrutura real do repositório
 *
 * `https://thumbnails.libretro.com/<Playlist>/Named_Boxarts/<Nome do Jogo>.png`
 *
 * - `<Playlist>` é o nome da playlist do RetroArch, que é o nome completo do
 *   sistema no padrão do banco de dados libretro — `Nintendo - Super Nintendo
 *   Entertainment System`, e não `snes`.
 * - São três pastas por sistema: `Named_Boxarts` (capa), `Named_Titles` (tela
 *   de título) e `Named_Snaps` (captura de jogo). Capa é a primeira.
 * - O nome do arquivo é o nome do jogo na playlist, que segue a nomenclatura
 *   No-Intro/Redump — com a região entre parênteses (`Chrono Trigger (USA)`).
 * - Dez caracteres do título viram `_` no nome do arquivo: e-comercial,
 *   asterisco, barra, dois-pontos, crase, menor, maior, interrogação, barra
 *   invertida e barra vertical. (A lista literal não cabe num comentário de
 *   bloco: ela tem uma sequência que o fecharia no meio.)
 *
 * Confirmado na documentação do libretro
 * (https://docs.libretro.com/guides/roms-playlists-thumbnails/) e no README do
 * repositório (https://github.com/libretro/libretro-thumbnails).
 *
 * ## Por que uma lista de candidatos, e não uma consulta
 *
 * O servidor de thumbnails serve arquivo estático: não existe busca, só
 * `GET`/`HEAD` num caminho exato. E o nosso `games.title` guarda o título
 * limpo (`Chrono Trigger`), enquanto o arquivo de lá carrega a região
 * (`Chrono Trigger (USA)`). Então perguntamos por uma lista curta de nomes
 * plausíveis, na ordem em que fazem sentido para um catálogo em português do
 * Brasil, e ficamos com o primeiro que existir — que é o "pega a primeira
 * correspondência razoável" da issue #77.
 *
 * O preço é honesto e está escrito aqui: título com sufixo que não está nesta
 * lista (`(Japan, USA) (En,Ja)`, `(USA) (Rev 1)`) não é encontrado, e o jogo
 * segue sem capa. Cobertura não é 100%, e nunca foi a promessa.
 */

/** A playlist do RetroArch de cada console que o PixelVault suporta. */
const PLAYLIST_POR_SISTEMA: Record<SystemId, string> = {
  snes: 'Nintendo - Super Nintendo Entertainment System',
  nes: 'Nintendo - Nintendo Entertainment System',
  gb: 'Nintendo - Game Boy',
  gba: 'Nintendo - Game Boy Advance',
  genesis: 'Sega - Mega Drive - Genesis',
};

/**
 * As regiões tentadas, em ordem.
 *
 * Primeiro o título cru (raro, mas é o que homebrew e alguns títulos têm),
 * depois as regiões cujo nome de arquivo casa com um título em alfabeto
 * latino. `(Japan)` fica por último: quando o dump japonês é o único que
 * existe, o título do nosso catálogo tende a ser o ocidental mesmo assim, e
 * chutá-lo antes acharia capa errada com mais frequência do que acharia capa.
 */
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
export function nomeDeArquivoNoLibretro(nome: string): string {
  return nome.replace(RESERVADOS, '_');
}

/**
 * As URLs de capa a tentar, em ordem, para um jogo.
 *
 * Devolve lista vazia para título em branco: perguntar `/Named_Boxarts/.png`
 * ao servidor seria gastar rede para receber 404.
 */
export function urlsCandidatasDeCapa(baseUrl: string, jogo: JogoSemCapa): string[] {
  const titulo = jogo.title.trim();
  if (titulo.length === 0) return [];

  const playlist = PLAYLIST_POR_SISTEMA[jogo.systemId];
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  return REGIOES.map((regiao) => {
    const arquivo = nomeDeArquivoNoLibretro(`${titulo}${regiao}`);
    return `${base}/${encodeURIComponent(playlist)}/Named_Boxarts/${encodeURIComponent(arquivo)}.png`;
  });
}
