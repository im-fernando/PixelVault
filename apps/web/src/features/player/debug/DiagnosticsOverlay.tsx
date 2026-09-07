import type { ReactNode } from 'react';
import { INTERVALO_ALVO_MS, type VereditoDePacing } from './frame-pacing.js';
import { NOME_DO_ATALHO } from './diagnostics-flag.js';
import type { AmostraDeDiagnostico } from './use-diagnostics.js';

/**
 * O painel de diagnóstico.
 *
 * A regra que ele obedece: **nunca mostrar um número sozinho quando ele
 * consegue mentir.** "60 fps" grande e centralizado é a mentira mais fácil de
 * contar sobre emulação, então aqui a média vem sempre acompanhada de p95, p99,
 * pior quadro, desvio padrão e contagem de atrasos — e de um veredito em uma
 * palavra que olha para o atraso antes de olhar para a média.
 *
 * As duas taxas também aparecem separadas: quantos quadros o **navegador
 * apresentou** e quantos o **core emulou**. Elas divergem, e a divergência é
 * informação: core a 60 com apresentação a 30 é problema de render; core a 45
 * com apresentação a 60 é problema de emulação.
 */

const DECIMAL = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});
const INTEIRO = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const PERCENTUAL = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const VEREDITO: Record<VereditoDePacing, { readonly rotulo: string; readonly cor: string }> = {
  estavel: { rotulo: 'pacing estável', cor: 'text-emerald-400' },
  irregular: { rotulo: 'pacing irregular', cor: 'text-amber-400' },
  engasgando: { rotulo: 'engasgando', cor: 'text-accent' },
  'sem-dados': { rotulo: 'medindo…', cor: 'text-vault-700' },
};

interface Props {
  readonly amostra: AmostraDeDiagnostico;
  readonly aoFechar: () => void;
}

export function DiagnosticsOverlay({ amostra, aoFechar }: Props) {
  const { pacing, carga, audio } = amostra;
  const veredito = VEREDITO[amostra.veredito];

  return (
    <div
      role="region"
      aria-label="Diagnóstico de performance"
      className="absolute top-3 left-3 z-10 w-64 max-w-[calc(100%-1.5rem)] rounded-lg border border-vault-800 bg-vault-950/90 p-2.5 font-mono text-[10px] leading-relaxed text-vault-300 shadow-lg backdrop-blur"
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[9px] tracking-widest text-vault-700 uppercase">diagnóstico</span>
        <button
          type="button"
          onClick={aoFechar}
          className="text-[9px] text-vault-700 uppercase hover:text-vault-100"
        >
          {NOME_DO_ATALHO} fecha
        </button>
      </div>

      <p className="mt-1.5 flex items-baseline gap-2">
        <strong className="text-base font-bold text-vault-100">{DECIMAL.format(pacing.fps)}</strong>
        <span className="text-vault-700">fps apresentados</span>
      </p>
      <p className={`font-semibold ${veredito.cor}`}>{veredito.rotulo}</p>

      <Grafico historicoMs={amostra.historicoMs} piorMs={pacing.piorMs} />

      <Secao>
        <Linha
          rotulo="frame time"
          valor={`${DECIMAL.format(pacing.frameTimeMedioMs)} ms · med ${DECIMAL.format(pacing.medianaMs)}`}
        />
        <Linha
          rotulo="p95 / p99"
          valor={`${DECIMAL.format(pacing.p95Ms)} / ${DECIMAL.format(pacing.p99Ms)} ms`}
        />
        <Linha rotulo="pior quadro" valor={`${DECIMAL.format(pacing.piorMs)} ms`} />
        <Linha rotulo="variância (σ)" valor={`± ${DECIMAL.format(pacing.desvioPadraoMs)} ms`} />
        <Linha
          rotulo="atrasados"
          destaque={pacing.quadrosAtrasados > 0}
          valor={`${INTEIRO.format(pacing.quadrosAtrasados)} (${PERCENTUAL.format(pacing.proporcaoAtrasada)}) · ${INTEIRO.format(pacing.quadrosPerdidos)} perdidos`}
        />
        <Linha
          rotulo="janela"
          valor={`${INTEIRO.format(pacing.amostras)} quadros${pacing.interrupcoes > 0 ? ` · ${INTEIRO.format(pacing.interrupcoes)} interrupções` : ''}`}
        />
      </Secao>

      <Secao>
        <Linha
          rotulo="core emulou"
          valor={amostra.fpsDoCore === null ? '—' : `${DECIMAL.format(amostra.fpsDoCore)} fps`}
        />
        <Linha rotulo="estado" valor={amostra.status} />
        <Linha rotulo="core" valor={amostra.coreVersion ?? '—'} />
      </Secao>

      <Secao>
        <Linha rotulo="carga · core" valor={ms(carga.coreMs)} />
        <Linha rotulo="carga · ROM" valor={ms(carga.romMs)} />
        <Linha rotulo="1º quadro" valor={ms(carga.primeiroQuadroMs)} />
        <Linha rotulo="total até jogar" valor={ms(carga.totalMs)} />
        {amostra.recursos.map((recurso) => (
          <p key={recurso.nome} className="truncate text-[9px] text-vault-700">
            {recurso.nome} · {kb(recurso.bytesDecodificados)} · {INTEIRO.format(recurso.duracaoMs)}{' '}
            ms · {recurso.deCache ? 'cache' : 'rede'}
          </p>
        ))}
      </Secao>

      <Secao>
        {audio.contextos === 0 ? (
          <p className="text-vault-700">
            áudio: nenhum contexto observado. A sonda só enxerga o que nasce depois de o painel
            abrir — recarregue com <code>?diagnostico=1</code> para pegar o boot do core.
          </p>
        ) : (
          <>
            <Linha
              rotulo="áudio"
              valor={`${INTEIRO.format(audio.taxaDeAmostragem ?? 0)} Hz · ${audio.estado ?? '—'}`}
            />
            <Linha
              rotulo="latência saída"
              valor={`${ms(audio.latenciaDeSaidaMs)} · base ${ms(audio.latenciaBaseMs)}`}
            />
          </>
        )}
        <p className="text-vault-700">
          Estalo e underrun não são medidos aqui: dependem do buffer do core.
        </p>
      </Secao>
    </div>
  );
}

function Secao({ children }: { readonly children: ReactNode }) {
  return <div className="mt-2 border-t border-vault-800 pt-1.5">{children}</div>;
}

function Linha({
  rotulo,
  valor,
  destaque = false,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly destaque?: boolean;
}) {
  return (
    <p className="flex justify-between gap-2">
      <span className="shrink-0 text-vault-700">{rotulo}</span>
      <span className={`truncate text-right ${destaque ? 'text-accent' : 'text-vault-100'}`}>
        {valor}
      </span>
    </p>
  );
}

/**
 * Os últimos quadros, um traço cada.
 *
 * O gráfico existe porque distribuição não cabe em número: quatro engasgos
 * espalhados e um engasgo de 60 ms dão o mesmo p99, e se jogam muito diferente.
 * A linha tracejada é o orçamento de 16,7 ms — tudo que passa dela é quadro que
 * chegou atrasado.
 *
 * É um `<path>` só, e não 120 elementos: o painel não pode custar o que mede.
 */
function Grafico({
  historicoMs,
  piorMs,
}: {
  readonly historicoMs: readonly number[];
  readonly piorMs: number;
}) {
  const altura = 26;
  const largura = 120;
  // O teto acompanha o pior quadro, mas nunca fica abaixo de dois orçamentos:
  // senão um segundo perfeito desenharia picos que não existem.
  const teto = Math.max(INTERVALO_ALVO_MS * 2, piorMs * 1.1);
  const y = (valor: number): number => altura - Math.min(altura, (valor / teto) * altura);

  const tracos = historicoMs
    .map((valor, indice) => {
      const x = largura - historicoMs.length + indice + 0.5;
      return `M${x.toFixed(1)} ${altura}V${y(valor).toFixed(1)}`;
    })
    .join('');

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      preserveAspectRatio="none"
      aria-hidden
      className="mt-1.5 h-7 w-full"
    >
      <path d={tracos} stroke="currentColor" strokeWidth={0.8} className="text-vault-300" />
      <line
        x1={0}
        x2={largura}
        y1={y(INTERVALO_ALVO_MS)}
        y2={y(INTERVALO_ALVO_MS)}
        stroke="currentColor"
        strokeWidth={0.5}
        strokeDasharray="3 3"
        className="text-accent/70"
      />
    </svg>
  );
}

function ms(valor: number | null): string {
  return valor === null ? '—' : `${INTEIRO.format(valor)} ms`;
}

function kb(bytes: number): string {
  if (bytes <= 0) return '—';
  if (bytes >= 1024 * 1024) return `${DECIMAL.format(bytes / 1048576)} MB`;
  return `${INTEIRO.format(bytes / 1024)} kB`;
}
