import type { SystemId } from '@pixelvault/contracts';
import type { ReactNode } from 'react';

/**
 * O cartucho na prateleira — o elemento pelo qual o PixelVault é reconhecido.
 *
 * É visto **de lado**, como uma coleção de verdade fica guardada, e não como
 * grade de capas. A escolha resolve um problema real do nosso conteúdo antes
 * de ser estética: homebrew quase nunca tem arte de caixa (o Super Sudoku tem
 * `coverUrl` nulo), e uma grade de capas ficaria cheia de retângulo vazio.
 * Aqui a ausência de capa não é buraco — é como o objeto realmente é.
 *
 * A etiqueta ocupa a parte de cima, como na etiqueta impressa do cartucho, e
 * o título é estampado na faixa. Passar o mouse **puxa o cartucho da
 * prateleira**, que é o gesto de escolher um jogo.
 */

interface Props {
  readonly titulo: string;
  readonly systemId: SystemId;
  /** Linha pequena embaixo da etiqueta. Editora, ano, o que for verdade. */
  readonly selo?: string | undefined;
  /** Cor da faixa. Sem valor, deriva do título — carts nunca são todos iguais. */
  readonly matiz?: number | undefined;
  readonly capaUrl?: string | null | undefined;
  readonly desbotado?: boolean;
  readonly children?: ReactNode;
}

/**
 * Um matiz estável por título.
 *
 * Etiqueta de cartucho é colorida e cada jogo tem a sua; uma prateleira toda
 * da mesma cor não parece uma prateleira. Derivar do título mantém a cor
 * estável entre recarregamentos sem precisar guardar nada.
 */
function numeroDeAcervo(titulo: string, systemId: SystemId): string {
  let h = 7;
  for (const ch of titulo) h = (h * 33 + ch.codePointAt(0)!) % 100000;
  return `${systemId.toUpperCase()}-${String(h).padStart(5, '0')}`;
}

function matizDoTitulo(titulo: string): number {
  let h = 0;
  for (const ch of titulo) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

export function Cartucho({
  titulo,
  systemId,
  selo,
  matiz,
  capaUrl,
  desbotado = false,
  children,
}: Props) {
  const h = matiz ?? matizDoTitulo(titulo);

  return (
    <div
      className={`relative flex h-64 w-full flex-col transition-transform duration-200 ease-out group-hover:-translate-y-3 group-focus-visible:-translate-y-3 ${
        desbotado ? 'opacity-55' : ''
      }`}
    >
      {/* A carcaça. O entalhe do topo é o chanfro do cartucho de SNES. */}
      <div
        className="relative flex h-full flex-col overflow-hidden bg-ink-850 shadow-[0_8px_0_-2px_rgba(0,0,0,0.45)] ring-1 ring-ink-800 transition group-hover:ring-ink-700"
        style={{ borderRadius: '3px 3px 8px 8px' }}
      >
        <div className="mx-auto h-1.5 w-10 rounded-b bg-ink-950" aria-hidden="true" />

        {/* A etiqueta impressa. */}
        <div className="mx-2 mt-2 flex flex-1 flex-col overflow-hidden rounded-[2px] bg-label-100">
          <div
            className="px-2 py-1.5"
            style={{ backgroundColor: `oklch(0.62 0.16 ${h})` }}
            aria-hidden="true"
          >
            <div className="h-0.5 w-full bg-black/25" />
          </div>

          <div className="flex flex-1 flex-col gap-1.5 p-2">
            <p className="titulo-estampado text-[0.72rem] leading-[1.1] text-ink-950">{titulo}</p>

            {capaUrl ? (
              <img
                src={capaUrl}
                alt=""
                loading="lazy"
                className="min-h-0 w-full flex-1 rounded-[1px] object-cover"
              />
            ) : (
              /*
                Sem capa, a etiqueta não finge ter uma: recebe a tarja de
                catalogação, que é o que uma etiqueta de acervo teria mesmo.
                O quadrado colorido repete o matiz do jogo, então a prateleira
                continua legível de longe.
              */
              <div
                className="min-h-0 flex-1 rounded-[1px]"
                style={{
                  background: `repeating-linear-gradient(
                    -45deg,
                    oklch(0.62 0.16 ${h} / 0.14) 0 6px,
                    transparent 6px 12px
                  )`,
                }}
                aria-hidden="true"
              />
            )}

            <div className="mt-auto">
              <p className="leitura truncate text-ink-700">{selo ?? systemId.toUpperCase()}</p>
              {/* Número de acervo: identidade curta e estável, derivada do
                  título. Num arquivo, todo item tem um. */}
              <p className="leitura text-ink-500/70">{numeroDeAcervo(titulo, systemId)}</p>
            </div>
          </div>
        </div>

        {/* As ranhuras de pegar, embaixo — a parte que fica pra fora do console. */}
        <div className="flex h-6 items-end justify-center gap-[3px] px-3 pb-1.5" aria-hidden="true">
          {Array.from({ length: 9 }, (_, i) => (
            <div key={i} className="h-2.5 w-[3px] rounded-full bg-ink-950/70" />
          ))}
        </div>

        {children}
      </div>
    </div>
  );
}
