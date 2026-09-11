import type { ReactNode } from 'react';
import type { UnlockedAchievement } from '@pixelvault/contracts';
import { Aviso } from '../../ui/Painel.js';
import { LinhaDeSecao, Numero, Sobrelinha } from '../../ui/Texto.js';
import { CartaoDeConquista } from './CartaoDeConquista.js';
import { CATALOGO_DE_CONQUISTAS } from './catalogo-de-conquistas.js';
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
 *
 * O número no cabeçalho é lido das duas listas, não escrito à mão: o total é
 * o tamanho do catálogo, e o catálogo já se confere contra o enum do
 * contrato em tempo de build.
 */
export function PainelDeConquistas() {
  const conquistas = useConquistas();

  if (conquistas.isPending) {
    return (
      <Pagina>
        <Cabecalho />
        <p className="mt-8 text-[13px] text-ink-500">Carregando conquistas…</p>
        <ul aria-hidden="true" className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <li key={i} className="h-24 animate-pulse rounded-[20px] bg-white/5" />
          ))}
        </ul>
      </Pagina>
    );
  }

  if (conquistas.isError) {
    return (
      <Pagina>
        <Cabecalho />
        <Aviso className="mt-8" titulo="Não foi possível carregar as conquistas agora." />
      </Pagina>
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
    <Pagina>
      <Cabecalho desbloqueadas={desbloqueadas.length} />

      <section aria-labelledby="conquistas-desbloqueadas" className="mt-10">
        <LinhaDeSecao
          id="conquistas-desbloqueadas"
          nome={`Desbloqueadas (${desbloqueadas.length})`}
        />
        {desbloqueadas.length === 0 ? (
          <div className="pv-vazio mt-4">
            <p className="max-w-prose text-[13.5px] leading-relaxed text-ink-500">
              Nenhuma conquista desbloqueada ainda — o acervo é o primeiro passo.
            </p>
          </div>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {desbloqueadas.map((conquista) => (
              <CartaoDeConquista
                key={conquista.code}
                conquista={conquista}
                unlockedAt={desbloqueadasPorCodigo.get(conquista.code)!.unlockedAt}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="conquistas-bloqueadas" className="mt-12">
        <LinhaDeSecao id="conquistas-bloqueadas" nome={`A desbloquear (${bloqueadas.length})`} />
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {bloqueadas.map((conquista) => (
            <CartaoDeConquista key={conquista.code} conquista={conquista} />
          ))}
        </ul>
      </section>
    </Pagina>
  );
}

function Pagina({ children }: { readonly children: ReactNode }) {
  return <div className="mx-auto max-w-[1080px] pt-6">{children}</div>;
}

/**
 * O título e, à direita, quantas já são da conta sobre o total — com a barra
 * fina que o console usa para progresso. Antes de a lista chegar o bloco de
 * contagem fica de fora: um "0 de 12" provisório seria a tela afirmando um
 * número que ainda não sabe.
 */
function Cabecalho({ desbloqueadas }: { readonly desbloqueadas?: number | undefined }) {
  const total = CATALOGO_DE_CONQUISTAS.length;

  return (
    <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-6">
      <div>
        <Sobrelinha>Sua conta · conquistas</Sobrelinha>
        <h1 className="titulo-cena mt-3 text-[clamp(34px,4vw,60px)] text-label-100">Conquistas</h1>
      </div>
      {desbloqueadas !== undefined && (
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <Numero
            rotulo="desbloqueadas"
            valor={
              <>
                {desbloqueadas}
                <span className="ml-1.5 text-[0.5em] text-ink-500">/ {total}</span>
              </>
            }
          />
          <div
            role="progressbar"
            aria-label="Conquistas desbloqueadas"
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={desbloqueadas}
            className="mt-3 h-1 w-full rounded bg-white/10"
          >
            <div
              className="h-full rounded bg-luz transition-[width]"
              style={{ width: `${(desbloqueadas / total) * 100}%` }}
            />
          </div>
        </div>
      )}
    </header>
  );
}
