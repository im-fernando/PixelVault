import type { SystemId } from '@pixelvault/contracts';

/**
 * Um cartucho na prateleira.
 *
 * Fica **de lombada**, encostado nos vizinhos, como coleção de verdade fica
 * guardada. Só o que sai para fora é a faixa colorida da etiqueta e o título
 * na vertical — é assim que se procura um jogo numa estante: correndo o olho
 * pelas lombadas, não olhando capa por capa.
 *
 * Passar o mouse ou dar foco **puxa o cartucho para fora e abre a etiqueta**.
 * Esse é o gesto de escolher um jogo, e é o único momento em que a capa
 * aparece.
 *
 * A escolha resolve um problema real antes de ser estética: homebrew quase
 * nunca tem arte de caixa. Grade de capas ficaria cheia de retângulo vazio.
 * Ver docs/design.md.
 */

interface Props {
  readonly titulo: string;
  readonly systemId: SystemId;
  readonly selo?: string | undefined;
  readonly capaUrl?: string | null | undefined;
  readonly desbotado?: boolean;
}

/** Matiz estável por título — prateleira toda da mesma cor não é prateleira. */
function matizDoTitulo(titulo: string): number {
  let h = 0;
  for (const ch of titulo) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Num arquivo, todo item tem um número. */
export function numeroDeAcervo(titulo: string, systemId: SystemId): string {
  let h = 7;
  for (const ch of titulo) h = (h * 33 + ch.codePointAt(0)!) % 100000;
  return `${systemId.toUpperCase()}-${String(h).padStart(5, '0')}`;
}

export function Cartucho({ titulo, systemId, selo, capaUrl, desbotado = false }: Props) {
  const h = matizDoTitulo(titulo);
  const faixa = `oklch(0.62 0.16 ${h})`;

  return (
    <div
      className={`relative h-[17rem] w-14 shrink-0 transition-[width,transform] duration-300 ease-out group-hover:w-44 group-hover:-translate-y-5 group-focus-visible:w-44 group-focus-visible:-translate-y-5 ${
        desbotado ? 'opacity-45 grayscale' : ''
      }`}
    >
      <div
        className="flex h-full flex-col overflow-hidden bg-ink-850 shadow-[inset_-6px_0_10px_-8px_rgba(0,0,0,0.9),inset_6px_0_10px_-8px_rgba(255,255,255,0.06)]"
        style={{ borderRadius: '2px 2px 6px 6px' }}
      >
        <div className="mx-auto h-1 w-6 rounded-b bg-ink-950" aria-hidden="true" />

        <div className="mx-1 mt-1 flex flex-1 flex-col overflow-hidden rounded-[1px] bg-label-100">
          <div
            className="h-1.5 w-full shrink-0"
            style={{ backgroundColor: faixa }}
            aria-hidden="true"
          />

          {/* Fechado: título de lombada. */}
          <div className="flex flex-1 items-start justify-center overflow-hidden pt-2 group-hover:hidden group-focus-visible:hidden">
            <p
              className="titulo-estampado text-[0.6rem] leading-none text-ink-950"
              style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
            >
              {titulo}
            </p>
          </div>

          {/* Aberto: a etiqueta inteira. */}
          <div className="hidden flex-1 flex-col gap-1.5 p-2 group-hover:flex group-focus-visible:flex">
            <p className="titulo-estampado text-[0.72rem] leading-[1.1] text-ink-950">{titulo}</p>
            {capaUrl ? (
              <img
                src={capaUrl}
                alt=""
                loading="lazy"
                className="min-h-0 w-full flex-1 rounded-[1px] object-cover"
              />
            ) : (
              <div
                className="min-h-0 flex-1 rounded-[1px]"
                style={{
                  background: `repeating-linear-gradient(-45deg, oklch(0.62 0.16 ${h} / 0.16) 0 6px, transparent 6px 12px)`,
                }}
                aria-hidden="true"
              />
            )}
            <div>
              <p className="leitura truncate text-ink-700">{selo ?? systemId.toUpperCase()}</p>
              <p className="leitura text-ink-500/70">{numeroDeAcervo(titulo, systemId)}</p>
            </div>
          </div>
        </div>

        <div className="flex h-4 items-end justify-center gap-[2px] px-1 pb-1" aria-hidden="true">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-2 w-[2px] rounded-full bg-ink-950/70" />
          ))}
        </div>
      </div>
    </div>
  );
}
