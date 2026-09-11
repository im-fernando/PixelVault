import type { UnlockedAchievement } from '@pixelvault/contracts';
import { CATALOGO_DE_CONQUISTAS, type ConquistaDoCatalogo } from './catalogo-de-conquistas.js';
import { useConquistas } from './use-conquistas.js';

/**
 * A vitrine de conquistas da conta — issue #121.
 *
 * Desbloqueada em destaque (com a data que o relógio do servidor carimbou);
 * bloqueada visível mas discreta — mostrar o que falta é parte do incentivo
 * (a issue pede isso de propósito), sem esconder a conquista atrás de um
 * "???"; ela só perde o destaque visual, nunca o texto. Nenhuma conquista de
 * hoje guarda spoiler de conteúdo (todas são limiar ou primeiro gesto), então
 * a mesma `descricao` serve para os dois estados — ver o comentário do
 * catálogo.
 */
export function PainelDeConquistas() {
  const conquistas = useConquistas();

  if (conquistas.isPending) {
    return <p className="leitura px-6 text-ink-700">Carregando conquistas…</p>;
  }

  if (conquistas.isError) {
    return (
      <p className="leitura px-6 text-alert" role="alert">
        Não foi possível carregar as conquistas agora.
      </p>
    );
  }

  const desbloqueadasPorCodigo = new Map<string, UnlockedAchievement>(
    conquistas.data.achievements.map((item) => [item.code, item]),
  );

  const desbloqueadas = CATALOGO_DE_CONQUISTAS.filter((conquista) =>
    desbloqueadasPorCodigo.has(conquista.code),
  );
  const bloqueadas = CATALOGO_DE_CONQUISTAS.filter(
    (conquista) => !desbloqueadasPorCodigo.has(conquista.code),
  );

  return (
    <div className="mx-auto max-w-2xl px-6">
      <h1 className="titulo-estampado text-2xl leading-none text-label-100">Conquistas</h1>

      <section aria-labelledby="conquistas-desbloqueadas" className="mt-6">
        <h2
          id="conquistas-desbloqueadas"
          className="leitura border-b border-ink-850 pb-2 text-ink-500"
        >
          Desbloqueadas ({desbloqueadas.length})
        </h2>
        {desbloqueadas.length === 0 ? (
          <p className="mt-3 text-sm text-ink-700">
            Nenhuma conquista desbloqueada ainda — o acervo é o primeiro passo.
          </p>
        ) : (
          <ul className="mt-3 flex flex-col gap-3">
            {desbloqueadas.map((conquista) => (
              <ConquistaDesbloqueada
                key={conquista.code}
                conquista={conquista}
                unlockedAt={desbloqueadasPorCodigo.get(conquista.code)!.unlockedAt}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="conquistas-bloqueadas" className="mt-8">
        <h2
          id="conquistas-bloqueadas"
          className="leitura border-b border-ink-850 pb-2 text-ink-700"
        >
          A desbloquear ({bloqueadas.length})
        </h2>
        <ul className="mt-3 flex flex-col gap-2">
          {bloqueadas.map((conquista) => (
            <ConquistaBloqueada key={conquista.code} conquista={conquista} />
          ))}
        </ul>
      </section>
    </div>
  );
}

function ConquistaDesbloqueada({
  conquista,
  unlockedAt,
}: {
  readonly conquista: ConquistaDoCatalogo;
  readonly unlockedAt: string;
}) {
  return (
    <li className="flex items-baseline justify-between gap-4 rounded border border-ink-800 bg-ink-900 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-label-100">{conquista.titulo}</p>
        <p className="mt-0.5 text-xs text-ink-500">{conquista.descricao}</p>
      </div>
      <time dateTime={unlockedAt} className="leitura shrink-0 text-ink-700">
        {formatarData(unlockedAt)}
      </time>
    </li>
  );
}

function ConquistaBloqueada({ conquista }: { readonly conquista: ConquistaDoCatalogo }) {
  return (
    <li className="flex items-baseline justify-between gap-4 rounded border border-ink-850 px-4 py-2 opacity-60">
      <div className="min-w-0">
        <p className="text-sm text-ink-500">{conquista.titulo}</p>
        <p className="mt-0.5 text-xs text-ink-700">{conquista.descricao}</p>
      </div>
    </li>
  );
}

function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}
