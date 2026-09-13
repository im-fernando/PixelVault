import type { SystemId } from '@pixelvault/contracts';
import type { BuscaDeCapaPorNome, CandidatoDeCapa } from '../domain/busca-de-capa-por-nome.js';
import { PLAYLIST_POR_SISTEMA } from './nomes-no-libretro.js';

/**
 * A lista completa de capas que o `libretro-thumbnails` tem para um console.
 *
 * `HEAD` num caminho exato (`capa-libretro-thumbnails.ts`) não dá isto: o
 * servidor de thumbnails serve arquivo estático, sem busca. Quem tem a lista
 * é o repositório do GitHub por trás dele — um por sistema —, e a Trees API
 * devolve o repositório inteiro numa chamada só (`recursive=1`), o que é
 * exatamente o que permite cachear e nunca repetir a chamada por causa de
 * cada tecla que a pessoa digita.
 */
const BASE_DA_API = 'https://api.github.com/repos/libretro-thumbnails';
const BASE_DAS_IMAGENS = 'https://thumbnails.libretro.com';

/** Quanto tempo a lista de um sistema fica em cache. A lista muda por PR — nunca em minutos. */
const TTL_DA_LISTA_MS = 24 * 60 * 60 * 1000;

/** Teto de rede por chamada à Trees API — ela é maior que um `HEAD`, mas ainda tem que acabar. */
const TEMPO_LIMITE_MS = 15_000;

/** Teto de candidatos devolvidos — a lista completa de um sistema passa de 3 mil nomes. */
const TETO_DE_CANDIDATOS = 20;

/** O recorte do `fetch` que este adaptador usa. */
export type BuscarHttpJson = (
  url: string,
  opcoes: { signal: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface OpcoesDaBuscaPorNome {
  buscarHttp?: BuscarHttpJson;
  ttlMs?: number;
  tempoLimiteMs?: number;
  agora?: () => number;
}

interface EntradaDaArvore {
  path: string;
  type: string;
}

interface RespostaDaArvore {
  tree: EntradaDaArvore[];
  truncated: boolean;
}

/** `Nintendo - Super Nintendo Entertainment System` → `Nintendo_-_Super_Nintendo_Entertainment_System`. */
function repositorioDoSistema(playlist: string): string {
  return playlist.replaceAll(' ', '_');
}

/** Um caminho de `Named_Boxarts/<nome>.png` devolve `<nome>`. Qualquer outra coisa não interessa aqui. */
function tituloDoCaminho(caminho: string): string | null {
  const prefixo = 'Named_Boxarts/';
  const sufixo = '.png';
  if (!caminho.startsWith(prefixo) || !caminho.endsWith(sufixo)) return null;
  return caminho.slice(prefixo.length, -sufixo.length);
}

export function criarBuscaDeCapaPorNomeNoLibretro(
  opcoes: OpcoesDaBuscaPorNome = {},
): BuscaDeCapaPorNome {
  const {
    buscarHttp = fetch,
    ttlMs = TTL_DA_LISTA_MS,
    tempoLimiteMs = TEMPO_LIMITE_MS,
    agora = Date.now,
  } = opcoes;

  const cache = new Map<SystemId, { titulos: readonly string[]; expiraEm: number }>();

  async function titulosDoSistema(systemId: SystemId): Promise<readonly string[]> {
    const cacheado = cache.get(systemId);
    if (cacheado !== undefined && cacheado.expiraEm > agora()) return cacheado.titulos;

    const repositorio = repositorioDoSistema(PLAYLIST_POR_SISTEMA[systemId]);
    const controlador = new AbortController();
    const vencimento = setTimeout(() => controlador.abort(), tempoLimiteMs);

    try {
      const resposta = await buscarHttp(
        `${BASE_DA_API}/${repositorio}/git/trees/master?recursive=1`,
        { signal: controlador.signal },
      );
      if (!resposta.ok) {
        throw new Error(`GitHub respondeu ${resposta.status} para ${repositorio}`);
      }

      const corpo = (await resposta.json()) as RespostaDaArvore;
      // `truncated` só aconteceria acima de 100 000 entradas ou 7 MB de
      // resposta — nenhum sistema suportado chega perto disso hoje —, mas
      // ignorá-lo em silêncio devolveria uma lista incompleta sem avisar.
      if (corpo.truncated) {
        console.warn(`[catalog] árvore de ${repositorio} truncada pela API do GitHub`);
      }

      const titulos = corpo.tree
        .map((entrada) => tituloDoCaminho(entrada.path))
        .filter((titulo): titulo is string => titulo !== null);

      cache.set(systemId, { titulos, expiraEm: agora() + ttlMs });
      return titulos;
    } finally {
      clearTimeout(vencimento);
    }
  }

  return async (systemId: SystemId, termo: string): Promise<readonly CandidatoDeCapa[]> => {
    const termoNormalizado = termo.trim().toLowerCase();
    if (termoNormalizado.length === 0) return [];

    const titulos = await titulosDoSistema(systemId);
    const playlist = PLAYLIST_POR_SISTEMA[systemId];

    return titulos
      .filter((titulo) => titulo.toLowerCase().includes(termoNormalizado))
      .slice(0, TETO_DE_CANDIDATOS)
      .map((titulo) => ({
        title: titulo,
        coverUrl: `${BASE_DAS_IMAGENS}/${encodeURIComponent(playlist)}/Named_Boxarts/${encodeURIComponent(titulo)}.png`,
      }));
  };
}
