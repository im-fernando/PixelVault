import type { ReactNode } from 'react';
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
  /**
   * De que console. Nulo quando nem o catálogo nem a extensão do arquivo
   * respondem — caso que a biblioteca pessoal (#75) traz e que não pode virar
   * cartucho ausente: a ROM está lá, e a estante precisa dizer isso.
   */
  readonly systemId: SystemId | null;
  readonly selo?: string | undefined;
  readonly capaUrl?: string | null | undefined;
  /**
   * Imagem de lombada de verdade, para quando ela existe (ensaio da
   * biblioteca pessoal local — ver `LocalLibrary.tsx`). Sem ela, o cartucho
   * fechado mostra o título vertical gerado, que é o caso comum de homebrew.
   */
  readonly lombadaUrl?: string | null | undefined;
  readonly desbotado?: boolean;
  /**
   * A marca de favorito: a etiqueta adesiva que se cola na lombada para achar
   * o item sem ler a fileira inteira. Fica visível com o cartucho fechado, que
   * é quando ela serve para alguma coisa.
   */
  readonly favorito?: boolean;
  /**
   * O que a etiqueta aberta mostra embaixo de tudo — os botões da estante
   * pessoal, por exemplo.
   *
   * É um espaço, e não uma lista de ações: o cartucho não sabe o que se faz
   * com ele. Quem sabe é a prateleira que o desenhou. Repare que quem usa isto
   * NÃO pode embrulhar o cartucho num link: botão dentro de âncora é HTML
   * inválido, e a estante pessoal por enquanto não navega para lugar nenhum.
   */
  readonly rodape?: ReactNode;
}

/** Matiz estável por título — prateleira toda da mesma cor não é prateleira. */
function matizDoTitulo(titulo: string): number {
  let h = 0;
  for (const ch of titulo) h = (h * 31 + ch.codePointAt(0)!) % 360;
  return h;
}

/** Num arquivo, todo item tem um número — inclusive o de procedência incerta. */
export function numeroDeAcervo(titulo: string, systemId: SystemId | null): string {
  let h = 7;
  for (const ch of titulo) h = (h * 33 + ch.codePointAt(0)!) % 100000;
  return `${(systemId ?? 'rom').toUpperCase()}-${String(h).padStart(5, '0')}`;
}

export function Cartucho({
  titulo,
  systemId,
  selo,
  capaUrl,
  lombadaUrl,
  desbotado = false,
  favorito = false,
  rodape,
}: Props) {
  const h = matizDoTitulo(titulo);
  const faixa = `oklch(0.62 0.16 ${h})`;

  return (
    <div
      className={`relative h-[17rem] w-14 shrink-0 transition-[width,transform] duration-300 ease-out group-hover:w-44 group-hover:-translate-y-5 group-focus-within:w-44 group-focus-within:-translate-y-5 group-focus-visible:w-44 group-focus-visible:-translate-y-5 ${
        desbotado ? 'opacity-45 grayscale' : ''
      }`}
    >
      {favorito && <MarcaDeFavorito />}

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

          {/* Fechado: lombada de verdade quando existe, senão título gerado. */}
          <div className="flex flex-1 items-start justify-center overflow-hidden pt-2 group-hover:hidden group-focus-within:hidden group-focus-visible:hidden">
            {lombadaUrl ? (
              <img src={lombadaUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <p
                className="titulo-estampado text-[0.6rem] leading-none text-ink-950"
                style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
              >
                {titulo}
              </p>
            )}
          </div>

          {/* Aberto: a etiqueta inteira. */}
          <div className="hidden flex-1 flex-col gap-1.5 p-2 group-hover:flex group-focus-within:flex group-focus-visible:flex">
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
              <p className="leitura truncate text-ink-700">
                {selo ?? (systemId ?? 'sistema não identificado').toUpperCase()}
              </p>
              <p className="leitura text-ink-500/70">{numeroDeAcervo(titulo, systemId)}</p>
            </div>
            {rodape}
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

/**
 * A etiqueta adesiva de destaque, colada na lombada.
 *
 * Não é estrela: num acervo, o que marca um item é a tira de papel que sai
 * para fora da lombada, e é ela que se enxerga com a fileira fechada. Fica em
 * `label-100` porque é papel, e não numa das quatro cores dos slots de save —
 * aquelas têm significado próprio e não podem virar decoração (docs/design.md).
 */
function MarcaDeFavorito() {
  return (
    <span
      aria-hidden="true"
      className="absolute -top-2.5 right-2 z-10 h-7 w-2 bg-label-100 shadow-[0_1px_2px_rgba(0,0,0,0.5)]"
      style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 50% 78%, 0 100%)' }}
    />
  );
}
