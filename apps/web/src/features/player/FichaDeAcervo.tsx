import { Link } from '@tanstack/react-router';
import { ArrowLeft } from 'lucide-react';
import type { SystemId } from '@pixelvault/contracts';
import { classesDaPilula } from '../../ui/Botao.js';
import { numeroDeAcervo } from '../library/Cartucho.js';

/**
 * O cabeçalho da tela de jogo: a ficha do item, não título com subtítulo.
 *
 * Num acervo, a peça em exposição vem acompanhada da ficha — o que é, de onde
 * veio, sob que número está catalogada. Os campos são dados reais que já
 * existem no sistema (hash, tamanho, procedência); nenhum deles é enfeite, e
 * é isso que separa ficha de decoração com cara de ficha.
 *
 * O desenho é o da vitrine da home: a sobrelinha diz de que console e de que
 * procedência é o jogo, o título vem grande e apertado, e o resto da ficha
 * fica em chips. Console e procedência sobem para a sobrelinha porque é onde
 * a vitrine já os mostra; repeti-los num chip logo abaixo seria dizer a
 * mesma coisa duas vezes na mesma tela.
 */

export interface CampoDaFicha {
  readonly rotulo: string;
  readonly valor: string;
  /** Dado que a máquina produziu — sai na bitmap. */
  readonly maquina?: boolean;
}

const NA_SOBRELINHA: ReadonlySet<string> = new Set(['console', 'procedência']);

export function FichaDeAcervo({
  titulo,
  systemId,
  campos,
}: {
  readonly titulo: string;
  readonly systemId: SystemId;
  readonly campos: readonly CampoDaFicha[];
}) {
  const procedencia = campos.find((campo) => campo.rotulo === 'procedência')?.valor;
  const chips = campos.filter((campo) => !NA_SOBRELINHA.has(campo.rotulo));

  return (
    <header>
      <Link to="/" className={classesDaPilula({ variante: 'secundaria', pequena: true })}>
        <ArrowLeft size={14} /> Acervo
      </Link>

      <p className="sobrelinha mt-6">
        {systemId}
        {procedencia !== undefined && ` · ${procedencia}`}
      </p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1">
        <h1 className="titulo-cena text-[clamp(30px,3.6vw,56px)] text-label-100">{titulo}</h1>
        <span className="leitura text-ink-700">{numeroDeAcervo(titulo, systemId)}</span>
      </div>

      {chips.length > 0 && (
        <dl className="mt-5 flex flex-wrap gap-2">
          {chips.map((campo) => (
            <div key={campo.rotulo} className="pv-chip">
              <dt>{campo.rotulo}</dt>
              <dd
                className={
                  campo.maquina === true
                    ? 'leitura font-medium text-label-200'
                    : 'font-medium text-label-100'
                }
              >
                {campo.valor}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </header>
  );
}

/**
 * A tela antes de o item chegar: a ficha em branco e o palco apagado, no
 * mesmo lugar em que vão aparecer — para a página não pular de altura quando
 * o jogo resolver.
 */
export function TelaDeJogoFantasma() {
  return (
    <div className="mx-auto max-w-[1180px] animate-pulse" aria-hidden="true">
      <div className="h-[38px] w-[92px] rounded-full bg-ink-850" />
      <div className="mt-6 h-2.5 w-36 rounded bg-ink-850" />
      <div className="mt-4 h-[clamp(30px,3.6vw,56px)] w-2/3 max-w-[520px] rounded-lg bg-ink-850" />
      <div className="pv-palco mt-6 aspect-video max-h-[70vh] bg-ink-900" />
    </div>
  );
}
