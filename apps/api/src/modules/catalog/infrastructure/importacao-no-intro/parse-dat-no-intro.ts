/**
 * O formato clrmamepro dos `.dat` do No-Intro (espelho `libretro-database`),
 * num arquivo só — a issue #134.
 *
 * Está separado do que baixa (rede) e do que grava (Prisma) de propósito, no
 * mesmo espírito de `nomes-no-libretro.ts`: isto aqui é texto para estrutura,
 * puro e testável sem rede nem banco. Quem baixa e quem grava mora nos
 * scripts de `apps/api/scripts/no-intro/`, que não são módulo nenhum — são a
 * composition root de uma operação administrativa, no mesmo espírito do
 * `prisma/seed.ts`.
 *
 * ## O formato
 *
 * ```
 * game (
 *   name "Título (Região) (outras tags)"
 *   region "Região"
 *   rom ( name "arquivo.sfc" size 1048576 crc HEX md5 HEX sha1 HEX )
 * )
 * ```
 *
 * Um `game(...)` por combinação de região/revisão do mesmo jogo — o mesmo
 * jogo aparece várias vezes, uma por variante. `region` é opcional (falta em
 * lançamento mundial). Depois de `sha1` pode vir `serial "..."` — não
 * interessa aqui, e o parser ignora.
 *
 * ## Por que regex, e não um parser de clrmamepro de verdade
 *
 * O formato é repetitivo e sem aninhamento além de um nível (`rom(...)` nunca
 * contém outro `(`), e os `.dat` do libretro não escapam aspas dentro de
 * `name` (conferido nos cinco arquivos usados por esta importação). Trazer
 * uma dependência para isto seria peso demais para um formato deste tamanho.
 */

import type { SystemId } from '@pixelvault/contracts';

/** Uma linha de `game(...)` do `.dat`: um jogo, numa região/revisão. */
export interface EntradaNoIntro {
  /** O `name` do bloco `game`, cru — título com tags de região/revisão. */
  readonly nomeBruto: string;
  readonly regiao: string | null;
  readonly nomeDoArquivo: string;
  readonly sizeBytes: number;
  readonly crc32: string;
  readonly md5: string;
  readonly sha1: string;
}

/** Cada bloco `game ( ... )`, com o conteúdo entre parênteses capturado. */
const BLOCO_DE_JOGO = /^game \(\n([\s\S]*?)\n\)\n?/gm;

const CAMPO_NOME = /^\tname "(.*)"$/m;
const CAMPO_REGIAO = /^\tregion "(.*)"$/m;
const LINHA_DA_ROM =
  /^\trom \( name "(.*?)" size (\d+) crc ([0-9A-Fa-f]+) md5 ([0-9A-Fa-f]+) sha1 ([0-9A-Fa-f]+)(?: .*)? \)$/m;

/**
 * Lê o `.dat` inteiro e devolve uma entrada por bloco `game(...)`.
 *
 * Bloco sem `rom(...)` reconhecível (o cabeçalho `clrmamepro(...)` do topo do
 * arquivo, ou um bloco corrompido) é ignorado — silenciosamente para o
 * cabeçalho, que não é um `game(...)` e por isso nem casa a regex de fora.
 */
export function parseDatNoIntro(texto: string): EntradaNoIntro[] {
  const entradas: EntradaNoIntro[] = [];

  for (const blocoMatch of texto.matchAll(BLOCO_DE_JOGO)) {
    const conteudo = blocoMatch[1] ?? '';

    const nome = CAMPO_NOME.exec(conteudo)?.[1];
    const romMatch = LINHA_DA_ROM.exec(conteudo);
    if (nome === undefined || romMatch === null) continue;

    const [, nomeDoArquivo, size, crc32, md5, sha1] = romMatch;
    entradas.push({
      nomeBruto: nome,
      regiao: CAMPO_REGIAO.exec(conteudo)?.[1] ?? null,
      nomeDoArquivo: nomeDoArquivo ?? '',
      sizeBytes: Number(size),
      crc32: (crc32 ?? '').toLowerCase(),
      md5: (md5 ?? '').toLowerCase(),
      sha1: (sha1 ?? '').toLowerCase(),
    });
  }

  return entradas;
}

/**
 * As tags que tiram uma entrada da importação.
 *
 * Não é o escopo da issue #134 filtrar por qualidade de dump — mas importar
 * protótipo, beta e demo como se fossem o jogo lançado faria o catálogo
 * reconhecer errado (mesmo título, conteúdo diferente do que a maioria tem em
 * casa) e poluiria a busca de capa com título que a listagem pública nunca
 * deveria mostrar como o jogo em si. `[BIOS]` também sai: os cinco sistemas
 * suportados são cartucho, BIOS não é jogo.
 */
const TAGS_INDESEJADAS = /\((?:Proto|Beta|Demo|Sample|Debug)\b/i;

export function ehEntradaIndesejada(nomeBruto: string): boolean {
  return nomeBruto.startsWith('[BIOS]') || TAGS_INDESEJADAS.test(nomeBruto);
}

/**
 * O título antes da primeira tag entre parênteses — a convenção No-Intro para
 * "nome do jogo, sem região nem revisão" (mesma convenção que
 * `nomes-no-libretro.ts` já assume ao montar a lista de capas candidatas).
 *
 * `"Donkey Kong Country 2 - Diddy's Kong Quest (USA) (Rev 1)"` vira
 * `"Donkey Kong Country 2 - Diddy's Kong Quest"`.
 */
export function tituloCanonico(nomeBruto: string): string {
  const indice = nomeBruto.indexOf(' (');
  return (indice === -1 ? nomeBruto : nomeBruto.slice(0, indice)).trim();
}

/**
 * A tag `(Rev N)`, quando existe — é o que `game_roms.revision` guarda hoje
 * para o homebrew cadastrado à mão, e a importação segue a mesma convenção.
 */
export function extrairRevisao(nomeBruto: string): string | null {
  const casado = /\(Rev (\d+[a-z]?)\)/.exec(nomeBruto);
  return casado?.[1] === undefined ? null : `Rev ${casado[1]}`;
}

/** Um jogo (mesmo título canônico, mesmo sistema) com todas as variantes do `.dat`. */
export interface JogoImportado {
  readonly systemId: SystemId;
  readonly titulo: string;
  readonly slug: string;
  readonly variantes: readonly EntradaNoIntro[];
}

const CARACTERE_RESERVADO_NO_SLUG = /[^a-z0-9]+/g;

/**
 * O slug estável para o upsert (a chave que a issue pede para não duplicar
 * entre execuções). Prefixado pelo sistema porque o mesmo título comercial
 * existe em consoles diferentes — "Aladdin" tem versão de SNES e de Mega
 * Drive — e o slug é único globalmente em `games`.
 */
export function slugDoImportado(systemId: SystemId, titulo: string): string {
  // NFD separa acento de letra (é → e + ´); o replace tira só a marca
  // diacrítica (̀-ͯ), então "é" e "e" caem no mesmo slug.
  const base = titulo
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(CARACTERE_RESERVADO_NO_SLUG, '-')
    .replace(/^-+|-+$/g, '');

  return `${systemId}-${base}`;
}

/**
 * Agrupa as entradas do `.dat` por jogo (título canônico), descartando as
 * indesejadas (protótipo, beta, demo, sample, debug, BIOS).
 */
export function agruparPorJogo(
  systemId: SystemId,
  entradas: readonly EntradaNoIntro[],
): JogoImportado[] {
  const porSlug = new Map<string, { titulo: string; variantes: EntradaNoIntro[] }>();

  for (const entrada of entradas) {
    if (ehEntradaIndesejada(entrada.nomeBruto)) continue;

    const titulo = tituloCanonico(entrada.nomeBruto);
    if (titulo.length === 0) continue;

    const slug = slugDoImportado(systemId, titulo);
    const existente = porSlug.get(slug);
    if (existente === undefined) {
      porSlug.set(slug, { titulo, variantes: [entrada] });
    } else {
      existente.variantes.push(entrada);
    }
  }

  return [...porSlug.entries()].map(([slug, { titulo, variantes }]) => ({
    systemId,
    titulo,
    slug,
    variantes,
  }));
}
