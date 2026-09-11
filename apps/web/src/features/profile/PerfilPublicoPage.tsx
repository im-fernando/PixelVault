import type { ReactNode } from 'react';
import { CATALOGO_DE_CONQUISTAS } from '../achievements/catalogo-de-conquistas.js';
import { formatarPlaytime } from '../leaderboards/formatar-playtime.js';
import { ApiRequestError } from '../../lib/api.js';
import { usePerfilPublico } from './use-perfil-publico.js';

/**
 * O perfil público de uma conta — issue #123. Rota `/u/:handle`, sem exigir
 * sessão: qualquer visitante vê o perfil de qualquer conta.
 *
 * O que aparece é deliberadamente pouco: nome de exibição, conquistas
 * desbloqueadas (reaproveitando o catálogo estático de `achievements`, o
 * mesmo texto que `PainelDeConquistas` usa) e tempo jogado/jogos distintos
 * agregados. Nunca a biblioteca de ROMs — BYOR, ver ADR 0006 — e nunca uma
 * posição de ranking: o ranking da #122 é POR JOGO, não existe "a posição
 * desta pessoa" fora do contexto de um jogo específico (ver o cabeçalho de
 * `apps/api/src/http/perfil-publico-routes.ts`).
 */
export function PerfilPublicoPage({ handle }: { readonly handle: string }) {
  const { data: perfil, isPending, error } = usePerfilPublico(handle);

  if (isPending) {
    return (
      <Secao>
        <div className="animate-pulse space-y-2">
          <div className="h-8 w-48 bg-ink-900" />
          <div className="h-4 w-64 bg-ink-900" />
        </div>
      </Secao>
    );
  }

  if (error) {
    const naoEncontrado = error instanceof ApiRequestError && error.status === 404;
    return (
      <Secao>
        <div className="border-l-2 border-alert bg-ink-900 p-5">
          <h3 className="titulo-estampado text-sm text-label-100">
            {naoEncontrado ? 'Perfil não encontrado' : 'O perfil não respondeu'}
          </h3>
          <p className="mt-1 text-sm text-ink-500">
            {naoEncontrado
              ? `Não existe conta com o handle "${handle}".`
              : 'Não foi possível falar com a API agora.'}
          </p>
        </div>
      </Secao>
    );
  }

  const desbloqueadasPorCodigo = new Set(perfil.achievements.map((item) => item.code));
  const conquistasDesbloqueadas = CATALOGO_DE_CONQUISTAS.filter((conquista) =>
    desbloqueadasPorCodigo.has(conquista.code),
  );

  return (
    <Secao>
      <p className="leitura mb-3 text-ink-700">perfil público</p>
      <h1 className="titulo-estampado text-3xl leading-none text-label-100">
        {perfil.displayName}
      </h1>
      <p className="leitura mt-1 text-ink-700">@{perfil.handle}</p>

      <dl className="mt-6 flex gap-8 text-sm">
        <div>
          <dt className="leitura text-ink-700">tempo jogado</dt>
          <dd className="mt-1 text-label-100">{formatarPlaytime(perfil.totalPlaytimeSeconds)}</dd>
        </div>
        <div>
          <dt className="leitura text-ink-700">jogos distintos</dt>
          <dd className="mt-1 text-label-100">{perfil.distinctGamesCount}</dd>
        </div>
      </dl>

      <section aria-labelledby="conquistas-do-perfil" className="mt-8">
        <h2 id="conquistas-do-perfil" className="leitura border-b border-ink-850 pb-2 text-ink-500">
          Conquistas ({conquistasDesbloqueadas.length})
        </h2>
        {conquistasDesbloqueadas.length === 0 ? (
          <p className="mt-3 text-sm text-ink-700">Nenhuma conquista desbloqueada ainda.</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {conquistasDesbloqueadas.map((conquista) => (
              <li
                key={conquista.code}
                className="rounded border border-ink-800 bg-ink-900 px-4 py-3"
              >
                <p className="text-sm font-medium text-label-100">{conquista.titulo}</p>
                <p className="mt-0.5 text-xs text-ink-500">{conquista.descricao}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Secao>
  );
}

function Secao({ children }: { readonly children: ReactNode }) {
  return <section className="mx-6 mb-12 max-w-2xl">{children}</section>;
}
