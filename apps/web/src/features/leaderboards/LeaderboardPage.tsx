import type { ReactNode } from 'react';
import type { LeaderboardEntry } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { Aviso } from '../../ui/Painel.js';
import { Sobrelinha } from '../../ui/Texto.js';
import { formatarPlaytime } from './formatar-playtime.js';
import { TAMANHO_DO_TOP, useRankingDoJogo } from './use-ranking.js';

/**
 * O ranking de playtime de um jogo — issue #122.
 *
 * Ranking POR JOGO, não geral da conta: o `gameId` da URL é o mesmo que
 * identifica o jogo no catálogo, e a comparação só é honesta entre contas
 * jogando o MESMO jogo reconhecido (ver o cabeçalho de
 * `apps/api/src/modules/leaderboards/index.ts`). Total histórico, sem
 * temporada.
 *
 * As três primeiras posições ganham pódio; do quarto em diante é lista. A
 * posição da própria conta aparece sempre, mesmo fora do `top` mostrado —
 * é o critério de aceite da issue: numa linha própria, destacada, embaixo da
 * lista quando ela não está entre as primeiras.
 *
 * Ouro, prata e bronze são as únicas cores com significado aqui, e vão pela
 * POSIÇÃO devolvida pelo servidor, não pelo índice: duas contas empatadas
 * em primeiro são dois ouros, que é o que `RANK()` afirma.
 */
export function LeaderboardPage({ gameId }: { readonly gameId: string }) {
  const { data: ranking, isPending, error } = useRankingDoJogo(gameId);

  if (isPending) {
    return (
      <Pagina>
        <Cabecalho />
        <div aria-hidden="true" className="mt-10 grid gap-3 sm:grid-cols-3">
          {Array.from({ length: 3 }, (_, i) => (
            <div key={i} className="h-40 animate-pulse rounded-[20px] bg-white/5" />
          ))}
        </div>
        <div aria-hidden="true" className="mt-6 flex flex-col gap-1">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="h-13 animate-pulse rounded-[14px] bg-white/5" />
          ))}
        </div>
      </Pagina>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';
    return (
      <Pagina>
        <Cabecalho />
        <Aviso className="mt-10" titulo="O ranking não respondeu">
          {detalhe}
        </Aviso>
      </Pagina>
    );
  }

  const minhaPosicaoNoTop =
    ranking.me !== null && ranking.top.some((l) => l.userId === ranking.me?.userId);
  const podio = ranking.top.slice(0, 3);
  const demais = ranking.top.slice(3);
  const euForaDoTop = ranking.me !== null && !minhaPosicaoNoTop;

  return (
    <Pagina>
      <Cabecalho />

      {ranking.top.length === 0 ? (
        <p className="mt-8 text-[14px] text-ink-500">
          Ninguém creditou tempo jogado neste jogo ainda. Jogue um pouco e volte — o relógio do
          servidor conta sozinho.
        </p>
      ) : (
        <>
          <ol className="mt-10 grid gap-3 sm:grid-cols-3" aria-label="Pódio">
            {podio.map((linha) => (
              <NoPodio
                key={linha.userId}
                linha={linha}
                souEu={ranking.me?.userId === linha.userId}
              />
            ))}
          </ol>

          {(demais.length > 0 || euForaDoTop) && (
            <ol className="mt-6 flex flex-col gap-1" aria-label="Demais posições">
              {demais.map((linha) => (
                <LinhaDoRanking
                  key={linha.userId}
                  linha={linha}
                  souEu={ranking.me?.userId === linha.userId}
                />
              ))}
              {ranking.me !== null && euForaDoTop && (
                <>
                  <li aria-hidden="true" className="py-1 text-center text-ink-700">
                    ⋮
                  </li>
                  <LinhaDoRanking linha={ranking.me} souEu />
                </>
              )}
            </ol>
          )}
        </>
      )}

      {ranking.me === null && (
        <p className="mt-6 text-[14px] text-ink-500">
          Você ainda não tem tempo creditado neste jogo — sem posição para mostrar.
        </p>
      )}
    </Pagina>
  );
}

function corDoPodio(rank: number): string {
  if (rank === 1) return 'text-ouro';
  if (rank === 2) return 'text-prata';
  if (rank === 3) return 'text-bronze';
  return 'text-label-100';
}

function NoPodio({ linha, souEu }: { readonly linha: LeaderboardEntry; readonly souEu: boolean }) {
  return (
    <li
      className={`pv-painel pv-painel--vidro p-5 ${souEu ? 'border-luz/45 bg-luz/10' : ''}`}
      aria-current={souEu ? 'true' : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <p className={`pv-numero text-[44px] ${corDoPodio(linha.rank)}`}>
          {linha.rank}
          <span className="text-[0.45em]">º</span>
        </p>
        {souEu && <span className="pv-chip pv-chip--luz">você</span>}
      </div>
      <p className="mt-4 truncate text-[15px] font-semibold text-label-100">{linha.displayName}</p>
      <p className="leitura mt-1 truncate text-ink-500">@{linha.handle}</p>
      <p className="mt-4 text-[15px] text-label-100">
        {formatarPlaytime(linha.totalPlaytimeSeconds)}
      </p>
    </li>
  );
}

function LinhaDoRanking({
  linha,
  souEu,
}: {
  readonly linha: LeaderboardEntry;
  readonly souEu: boolean;
}) {
  return (
    <li
      className={`pv-linha-ranking ${souEu ? 'pv-linha-ranking--eu' : ''}`}
      aria-current={souEu ? 'true' : undefined}
    >
      <span className="leitura text-ink-500">#{linha.rank}</span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        <b className="truncate text-[14px] font-medium text-label-100">{linha.displayName}</b>
        <span className="leitura text-ink-700">@{linha.handle}</span>
        {souEu && <span className="pv-chip pv-chip--luz">você</span>}
      </span>
      <span className="text-[14px] text-label-100 tabular-nums">
        {formatarPlaytime(linha.totalPlaytimeSeconds)}
      </span>
    </li>
  );
}

function Cabecalho() {
  return (
    <header>
      <Sobrelinha>ranking · playtime total · por jogo</Sobrelinha>
      <h1 className="titulo-cena mt-3 text-[clamp(34px,4vw,60px)] text-label-100">
        Quem jogou mais
      </h1>
      <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-500">
        As {TAMANHO_DO_TOP} contas com mais tempo jogado NESTE jogo, pelo relógio do servidor —
        nunca pelo que o navegador de alguém declara.
      </p>
    </header>
  );
}

function Pagina({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto max-w-[900px] pt-6">{children}</div>;
}
