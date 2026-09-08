import type { BuscaDeCapa, JogoSemCapa } from '../domain/busca-de-capa.js';
import { urlsCandidatasDeCapa } from './nomes-no-libretro.js';

/**
 * O servidor que a comunidade libretro mantém para isso.
 *
 * Não é o GitHub cru: o repositório `libretro/libretro-thumbnails` é um
 * agregado de submódulos (um por sistema), e é este servidor que o RetroArch
 * consulta — "RetroArch retrieves thumbnails from a server
 * (https://thumbnails.libretro.com/) that is updated periodically with imports
 * from the Libretro thumbnail repository on github"
 * (https://docs.libretro.com/guides/roms-playlists-thumbnails/). Apontar para
 * `raw.githubusercontent.com` exigiria resolver o submódulo certo a cada
 * consulta e ainda bateria num host que não é feito para servir imagem a
 * usuário final.
 */
const BASE_PADRAO = 'https://thumbnails.libretro.com';

/**
 * Quanto tempo um "não tem" fica valendo sem perguntar de novo.
 *
 * Um dia. Capa não muda, e "o libretro não tem esta" só deixa de ser verdade
 * quando alguém abre um PR lá e o servidor importa — o que leva dias ou
 * semanas, nunca minutos. Menos que isso seria repetir a pergunta à toa; mais
 * que isso, num cache que já morre junto com o processo, não compraria nada.
 */
const TTL_DA_AUSENCIA_MS = 24 * 60 * 60 * 1000;

/** Teto de rede por candidato. Ninguém espera por esta busca, mas ela também não pode ficar pendurada para sempre. */
const TEMPO_LIMITE_MS = 5_000;

/**
 * Teto de chaves guardadas. O cache é de ausência, então ele cresce com a
 * quantidade de jogos que o libretro NÃO tem — poucos, mas sem limite natural.
 */
const TETO_DO_CACHE = 1_000;

/**
 * O recorte do `fetch` que este adaptador usa.
 *
 * Estreito de propósito: pede uma URL, devolve algo que diz se deu certo. É o
 * que o `fetch` global satisfaz e é o que o teste consegue implementar em três
 * linhas, sem servidor e sem biblioteca de mock.
 */
export type BuscarHttp = (
  url: string,
  opcoes: { method: string; signal: AbortSignal },
) => Promise<{ ok: boolean }>;

export interface OpcoesDaBuscaNoLibretro {
  /** Só o teste troca isto. */
  baseUrl?: string;
  /** O `fetch` a usar. Injetável para que o teste não dependa da rede. */
  buscarHttp?: BuscarHttp;
  ttlDaAusenciaMs?: number;
  tempoLimiteMs?: number;
  agora?: () => number;
}

/**
 * O adaptador que fala com o `libretro-thumbnails`.
 *
 * ## Como ele procura
 *
 * O servidor serve arquivo estático: não há endpoint de busca, só caminho
 * exato. Então ele pede `HEAD` na lista curta de nomes plausíveis que
 * `nomes-no-libretro.ts` monta e devolve o primeiro que responder 200 — sem
 * baixar um byte de imagem, porque o que vai para o banco é a URL, não o PNG
 * (issue #77: não vendorizar).
 *
 * ## O cache, e o que ele guarda
 *
 * Só a ausência, na memória do processo, por um dia.
 *
 * A capa encontrada não precisa de cache nenhum: ela é gravada em
 * `games.cover_url` e nunca mais é procurada — o banco é o cache permanente
 * dela, e guardar a URL (e não o arquivo) é o que mantém a promessa de não
 * vendorizar. Já o "não tem" não tem onde ser gravado sem inventar coluna, e
 * é justamente ele que se repetiria: duas pessoas subindo o mesmo jogo
 * desconhecido, ou a mesma pessoa subindo a coleção inteira, fariam a mesma
 * pergunta várias vezes ao serviço de terceiro.
 *
 * Memória do processo basta porque o dado é descartável por natureza: reiniciar
 * a API só faz o serviço ser consultado uma vez a mais por jogo. Um cache
 * compartilhado (Redis, tabela) custaria infraestrutura para economizar
 * requisição que já é rara.
 *
 * ## O que ele não faz
 *
 * Não engole falha de rede. Timeout e serviço fora do ar sobem como exceção
 * para quem chamou logar — e, como não entram no cache de ausência, o próximo
 * reconhecimento do mesmo jogo tenta de novo. Engolir a falha aqui a
 * transformaria em "esse jogo não tem capa" por 24 horas, que é mentira.
 */
export function criarBuscaNoLibretroThumbnails(opcoes: OpcoesDaBuscaNoLibretro = {}): BuscaDeCapa {
  const {
    baseUrl = BASE_PADRAO,
    buscarHttp = fetch,
    ttlDaAusenciaMs = TTL_DA_AUSENCIA_MS,
    tempoLimiteMs = TEMPO_LIMITE_MS,
    agora = Date.now,
  } = opcoes;

  /** Chave → instante em que o "não tem" deixa de valer. */
  const semCapaAte = new Map<string, number>();

  function chave(jogo: JogoSemCapa): string {
    return `${jogo.systemId}|${jogo.title.trim().toLowerCase()}`;
  }

  function registrarAusencia(chaveDoJogo: string): void {
    if (semCapaAte.size >= TETO_DO_CACHE) {
      const instante = agora();
      for (const [k, expiraEm] of semCapaAte) {
        if (expiraEm <= instante) semCapaAte.delete(k);
      }
      // Ainda cheio depois da poda: o cache inteiro vai embora. É cache de
      // ausência — perdê-lo custa algumas requisições a mais, e essa é a
      // política de despejo mais barata que não deixa a memória crescer sem
      // fim.
      if (semCapaAte.size >= TETO_DO_CACHE) semCapaAte.clear();
    }

    semCapaAte.set(chaveDoJogo, agora() + ttlDaAusenciaMs);
  }

  return {
    async buscar(jogo: JogoSemCapa): Promise<string | null> {
      const chaveDoJogo = chave(jogo);
      const expiraEm = semCapaAte.get(chaveDoJogo);
      if (expiraEm !== undefined && agora() < expiraEm) return null;
      if (expiraEm !== undefined) semCapaAte.delete(chaveDoJogo);

      for (const url of urlsCandidatasDeCapa(baseUrl, jogo)) {
        // `HEAD` porque a pergunta é "existe?", e a resposta que interessa é o
        // status. Baixar 300 KB de PNG para descobrir isso seria trocar banda
        // de um serviço mantido por voluntários por nada.
        const resposta = await buscarHttp(url, {
          method: 'HEAD',
          signal: AbortSignal.timeout(tempoLimiteMs),
        });

        if (resposta.ok) return url;
      }

      registrarAusencia(chaveDoJogo);
      return null;
    },
  };
}
