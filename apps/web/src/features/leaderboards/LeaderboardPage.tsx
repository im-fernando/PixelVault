import type { ReactNode } from 'react';
import type { LeaderboardEntry } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
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
 * A posição da própria conta aparece sempre, mesmo fora do `top` mostrado —
 * é o critério de aceite da issue: numa linha própria, destacada, embaixo da
 * tabela quando ela não está entre as primeiras.
 */
export function LeaderboardPage({ gameId }: { readonly gameId: string }) {
  const { data: ranking, isPending, error } = useRankingDoJogo(gameId);

  if (isPending) {
    return (
      <Secao>
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-9 bg-ink-900" />
          ))}
        </div>
      </Secao>
    );
  }

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';
    return (
      <Secao>
        <div className="border-l-2 border-alert bg-ink-900 p-5">
          <h3 className="titulo-estampado text-sm text-label-100">O ranking não respondeu</h3>
          <p className="mt-1 text-sm text-ink-500">{detalhe}</p>
        </div>
      </Secao>
    );
  }

  const minhaPosicaoNoTop =
    ranking.me !== null && ranking.top.some((l) => l.userId === ranking.me?.userId);

  return (
    <Secao>
      <p className="leitura mb-3 text-ink-700">ranking · playtime total · por jogo</p>
      <h1 className="titulo-estampado text-3xl text-label-100">Quem jogou mais</h1>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-ink-500">
        As {TAMANHO_DO_TOP} contas com mais tempo jogado NESTE jogo, pelo relógio do servidor —
        nunca pelo que o navegador de alguém declara.
      </p>

      {ranking.top.length === 0 ? (
        <p className="mt-8 text-sm text-ink-500">
          Ninguém creditou tempo jogado neste jogo ainda. Jogue um pouco e volte — o relógio do
          servidor conta sozinho.
        </p>
      ) : (
        <table className="mt-8 w-full max-w-xl border-collapse text-sm">
          <tbody>
            {ranking.top.map((linha) => (
              <LinhaDoRanking
                key={linha.userId}
                linha={linha}
                souEu={ranking.me?.userId === linha.userId}
              />
            ))}
            {ranking.me !== null && !minhaPosicaoNoTop && (
              <>
                <tr aria-hidden="true">
                  <td colSpan={3} className="py-1 text-center text-ink-700">
                    ⋮
                  </td>
                </tr>
                <LinhaDoRanking linha={ranking.me} souEu />
              </>
            )}
          </tbody>
        </table>
      )}

      {ranking.me === null && (
        <p className="mt-6 text-sm text-ink-500">
          Você ainda não tem tempo creditado neste jogo — sem posição para mostrar.
        </p>
      )}
    </Secao>
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
    <tr className={souEu ? 'bg-ink-900' : undefined}>
      <td className="w-12 border-b border-ink-850 py-2 text-ink-500">#{linha.rank}</td>
      <td className="border-b border-ink-850 py-2 text-label-100">
        {linha.displayName}
        <span className="leitura ml-2 text-ink-700">@{linha.handle}</span>
        {souEu && <span className="leitura ml-2 text-label-400">você</span>}
      </td>
      <td className="border-b border-ink-850 py-2 text-right text-ink-500">
        {formatarPlaytime(linha.totalPlaytimeSeconds)}
      </td>
    </tr>
  );
}

function Secao({ children }: { readonly children: ReactNode }) {
  return <section className="mx-6 mb-12">{children}</section>;
}
