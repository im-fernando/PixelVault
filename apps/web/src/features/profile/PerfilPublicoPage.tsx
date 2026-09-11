import type { ReactNode } from 'react';
import type { UnlockedAchievement } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { Aviso } from '../../ui/Painel.js';
import { LinhaDeSecao, Numero, Sobrelinha } from '../../ui/Texto.js';
import { CartaoDeConquista } from '../achievements/CartaoDeConquista.js';
import { CATALOGO_DE_CONQUISTAS } from '../achievements/catalogo-de-conquistas.js';
import { formatarPlaytime } from '../leaderboards/formatar-playtime.js';
import { usePerfilPublico } from './use-perfil-publico.js';

/**
 * O perfil público de uma conta — issue #123. Rota `/u/:handle`, sem exigir
 * sessão: qualquer visitante vê o perfil de qualquer conta.
 *
 * O que aparece é deliberadamente pouco: nome de exibição, conquistas
 * desbloqueadas (reaproveitando o catálogo estático de `achievements`, o
 * mesmo cartão que `PainelDeConquistas` usa) e tempo jogado/jogos distintos
 * agregados. Nunca a biblioteca de ROMs — BYOR, ver ADR 0006 — e nunca uma
 * posição de ranking: o ranking da #122 é POR JOGO, não existe "a posição
 * desta pessoa" fora do contexto de um jogo específico (ver o cabeçalho de
 * `apps/api/src/http/perfil-publico-routes.ts`).
 */
export function PerfilPublicoPage({ handle }: { readonly handle: string }) {
  const { data: perfil, isPending, error } = usePerfilPublico(handle);

  if (isPending) {
    return (
      <Pagina>
        <Sobrelinha>perfil público</Sobrelinha>
        <div aria-hidden="true" className="mt-4 flex items-center gap-6">
          <div className="h-18 w-18 shrink-0 animate-pulse rounded-full bg-white/5" />
          <div className="flex-1 space-y-3">
            <div className="h-10 max-w-72 animate-pulse rounded-lg bg-white/5" />
            <div className="h-7 w-32 animate-pulse rounded-full bg-white/5" />
          </div>
        </div>
      </Pagina>
    );
  }

  if (error) {
    const naoEncontrado = error instanceof ApiRequestError && error.status === 404;
    return (
      <Pagina>
        <Sobrelinha>perfil público</Sobrelinha>
        <Aviso
          className="mt-6"
          titulo={naoEncontrado ? 'Perfil não encontrado' : 'O perfil não respondeu'}
        >
          {naoEncontrado
            ? `Não existe conta com o handle "${handle}".`
            : 'Não foi possível falar com a API agora.'}
        </Aviso>
      </Pagina>
    );
  }

  const desbloqueadasPorCodigo = new Map<string, UnlockedAchievement>(
    perfil.achievements.map((item) => [item.code, item]),
  );
  const conquistasDesbloqueadas = CATALOGO_DE_CONQUISTAS.filter((conquista) =>
    desbloqueadasPorCodigo.has(conquista.code),
  );
  const inicial = perfil.displayName.trim().charAt(0).toUpperCase() || '?';

  return (
    <Pagina>
      <header className="flex flex-wrap items-center gap-x-7 gap-y-5">
        {/*
          A mesma medalha de avatar do chip de conta no cabeçalho, só que do
          tamanho de um título: o perfil não tem foto, e a inicial em luz é
          o que faz duas contas de nome parecido se distinguirem de longe.
        */}
        <span
          aria-hidden="true"
          className="grid h-18 w-18 shrink-0 place-items-center rounded-full bg-luz font-display text-[28px] font-bold text-ink-950"
        >
          {inicial}
        </span>
        <div className="min-w-0 flex-1">
          <Sobrelinha>perfil público</Sobrelinha>
          <h1 className="titulo-cena mt-2 text-[clamp(34px,4.4vw,64px)] text-label-100">
            {perfil.displayName}
          </h1>
          <div className="mt-4">
            <span className="pv-chip">@{perfil.handle}</span>
          </div>
        </div>
      </header>

      <div className="mt-12 flex flex-wrap gap-x-12 gap-y-6">
        <Numero rotulo="tempo jogado" valor={formatarPlaytime(perfil.totalPlaytimeSeconds)} />
        <Numero rotulo="jogos distintos" valor={perfil.distinctGamesCount} />
      </div>

      <section aria-labelledby="conquistas-do-perfil" className="mt-12">
        <LinhaDeSecao
          id="conquistas-do-perfil"
          nome={`Conquistas (${conquistasDesbloqueadas.length})`}
          nota={`de ${CATALOGO_DE_CONQUISTAS.length} possíveis`}
        />
        {conquistasDesbloqueadas.length === 0 ? (
          <div className="pv-vazio mt-4">
            <p className="text-[13.5px] leading-relaxed text-ink-500">
              Nenhuma conquista desbloqueada ainda.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {conquistasDesbloqueadas.map((conquista) => (
              <CartaoDeConquista
                key={conquista.code}
                conquista={conquista}
                unlockedAt={desbloqueadasPorCodigo.get(conquista.code)!.unlockedAt}
              />
            ))}
          </ul>
        )}
      </section>
    </Pagina>
  );
}

function Pagina({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto max-w-[1080px] pt-6">{children}</div>;
}
