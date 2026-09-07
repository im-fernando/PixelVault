import { Link } from '@tanstack/react-router';
import type { SystemId } from '@pixelvault/contracts';
import { numeroDeAcervo } from '../library/Cartucho.js';

/**
 * O cabeçalho da tela de jogo: a ficha do item, não título com subtítulo.
 *
 * Num acervo, a peça em exposição vem acompanhada da ficha — o que é, de onde
 * veio, sob que número está catalogada. Os campos são dados reais que já
 * existem no sistema (hash, tamanho, procedência); nenhum deles é enfeite, e
 * é isso que separa ficha de decoração com cara de ficha.
 */

export interface CampoDaFicha {
  readonly rotulo: string;
  readonly valor: string;
  /** Dado que a máquina produziu — sai na bitmap. */
  readonly maquina?: boolean;
}

export function FichaDeAcervo({
  titulo,
  systemId,
  campos,
}: {
  readonly titulo: string;
  readonly systemId: SystemId;
  readonly campos: readonly CampoDaFicha[];
}) {
  return (
    <header className="mb-5">
      <Link
        to="/"
        className="leitura text-ink-700 outline-none hover:text-ink-500 focus-visible:underline"
      >
        ← acervo
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-ink-850 pb-2">
        <h1 className="titulo-estampado text-2xl leading-none text-label-100">{titulo}</h1>
        <span className="leitura text-ink-700">{numeroDeAcervo(titulo, systemId)}</span>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2">
        {campos.map((campo) => (
          <div key={campo.rotulo}>
            <dt className="leitura text-ink-700">{campo.rotulo}</dt>
            <dd
              className={
                campo.maquina === true ? 'leitura text-label-200' : 'text-sm text-label-100'
              }
            >
              {campo.valor}
            </dd>
          </div>
        ))}
      </dl>
    </header>
  );
}
