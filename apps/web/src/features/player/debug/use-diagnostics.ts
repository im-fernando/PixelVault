import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { EmulatorStatus } from '@pixelvault/emulator-runtime';
import type { MarcoDeStatus } from '../use-emulator.js';
import { instalarSondaDeAudio, type EstadoDoAudio } from './audio-probe.js';
import { CHAVE_DE_DIAGNOSTICO, diagnosticoLigadoNoNavegador } from './diagnostics-flag.js';
import {
  MedidorDePacing,
  PACING_VAZIO,
  julgarPacing,
  type EstatisticaDePacing,
  type VereditoDePacing,
} from './frame-pacing.js';
import { linhaDoTempoDaCarga, type LinhaDoTempoDeCarga } from './load-timeline.js';
import { recursosDoEmulador, type RecursoBaixado } from './network-samples.js';

/**
 * De quanto em quanto tempo o painel se redesenha.
 *
 * A medição acontece a cada quadro; o React não. Renderizar componente 60 vezes
 * por segundo custaria mais que boa parte do que o painel está medindo — e um
 * medidor que provoca o engasgo que ele reporta é pior que medidor nenhum.
 * 250 ms é rápido o bastante para ver o número mexer.
 */
const INTERVALO_DE_ATUALIZACAO_MS = 250;

/** Intervalos desenhados no gráfico. 120 ≈ 2 segundos a 60 Hz. */
const QUADROS_NO_GRAFICO = 120;

/** Nome do objeto publicado no `window` enquanto o painel está aberto. */
export const GLOBAL_DE_DIAGNOSTICO = '__pixelvaultDiagnostico';

export interface AmostraDeDiagnostico {
  readonly status: EmulatorStatus;
  readonly coreVersion: string | null;
  /** Quadros que o **core** emulou por segundo, pelo evento `fps` do adapter. */
  readonly fpsDoCore: number | null;
  /** Ritmo com que o **navegador** apresentou quadros. É o que se sente. */
  readonly pacing: EstatisticaDePacing;
  readonly veredito: VereditoDePacing;
  readonly historicoMs: readonly number[];
  readonly carga: LinhaDoTempoDeCarga;
  readonly recursos: readonly RecursoBaixado[];
  readonly audio: EstadoDoAudio;
}

export interface Diagnostico {
  readonly visivel: boolean;
  readonly alternar: () => void;
  readonly amostra: AmostraDeDiagnostico | null;
}

export interface OpcoesDoDiagnostico {
  readonly status: EmulatorStatus;
  readonly fpsDoCore: number | null;
  readonly coreVersion: string | null;
  /** Instantes das transições de status, de `useEmulator`. */
  readonly lerMarcos: () => readonly MarcoDeStatus[];
}

/**
 * Liga o medidor de pacing, a marcação do primeiro quadro e a sonda de áudio ao
 * ciclo de vida do player.
 *
 * A marcação do primeiro quadro acontece com o painel aberto ou fechado: os
 * marcos de carga acontecem uma vez, no boot, e quem abre o painel depois ainda
 * quer saber quanto aquilo levou. O que fica desligado por padrão é o caro — o
 * laço por quadro, a sonda de áudio e o redesenho.
 */
export function useDiagnostico({
  status,
  fpsDoCore,
  coreVersion,
  lerMarcos,
}: OpcoesDoDiagnostico): Diagnostico {
  const [visivel, setVisivel] = useState(diagnosticoLigadoNoNavegador);
  const [amostra, setAmostra] = useState<AmostraDeDiagnostico | null>(null);

  const medidor = useMemo(() => new MedidorDePacing(), []);
  const primeiroQuadroRef = useRef<number | null>(null);

  // Lido dentro do laço de quadros, que não pode esperar re-render para
  // enxergar o valor novo.
  const contextoRef = useRef({ status, fpsDoCore, coreVersion, lerMarcos });
  contextoRef.current = { status, fpsDoCore, coreVersion, lerMarcos };

  const alternar = useCallback(() => {
    setVisivel((anterior) => {
      const proximo = !anterior;
      try {
        window.sessionStorage.setItem(CHAVE_DE_DIAGNOSTICO, proximo ? '1' : '0');
      } catch {
        // Armazenamento bloqueado só custa a memória entre recargas da página.
      }
      return proximo;
    });
  }, []);

  // Sessão nova conta do zero: o pacing e o tempo de carga do jogo anterior não
  // dizem nada sobre este.
  useEffect(() => {
    if (status === 'idle') {
      medidor.reiniciar();
      primeiroQuadroRef.current = null;
    }
    // A janela também recomeça ao entrar em execução: pacing medido com a
    // máquina parada descreve a página, e não a emulação.
    if (status === 'running') medidor.reiniciar();
  }, [status, medidor]);

  // Um único quadro agendado, e não um laço: marcar o primeiro quadro é barato
  // o bastante para acontecer mesmo com o painel fechado.
  useEffect(() => {
    if (status !== 'running') return;
    if (typeof requestAnimationFrame !== 'function') return;
    const quadro = requestAnimationFrame(() => {
      primeiroQuadroRef.current ??= performance.now();
    });
    return () => cancelAnimationFrame(quadro);
  }, [status]);

  useEffect(() => {
    if (!visivel) {
      setAmostra(null);
      return;
    }
    if (typeof requestAnimationFrame !== 'function') return;

    const sonda = instalarSondaDeAudio();
    const montar = (pacing: EstatisticaDePacing): AmostraDeDiagnostico => {
      const {
        status: statusAtual,
        fpsDoCore: fps,
        coreVersion: core,
        lerMarcos: marcos,
      } = contextoRef.current;
      const audio = sonda.ler();
      return {
        status: statusAtual,
        coreVersion: core,
        fpsDoCore: fps,
        pacing,
        veredito: julgarPacing(pacing),
        historicoMs: medidor.intervalos.slice(-QUADROS_NO_GRAFICO),
        carga: linhaDoTempoDaCarga(marcos(), primeiroQuadroRef.current),
        recursos: recursosDoEmulador(),
        // A sonda só enxerga contexto criado depois dela: zero contexto com o
        // jogo rodando significa "abri o painel tarde demais", não "sem áudio".
        audio,
      };
    };

    // O painel abre já com a linha do tempo de carga preenchida, sem esperar o
    // primeiro ciclo de atualização.
    setAmostra(montar(PACING_VAZIO));

    let quadro = 0;
    let proximaAtualizacao = 0;
    const passo = (instante: number): void => {
      medidor.registrar(instante);
      if (instante >= proximaAtualizacao) {
        proximaAtualizacao = instante + INTERVALO_DE_ATUALIZACAO_MS;
        setAmostra(montar(medidor.estatistica()));
      }
      quadro = requestAnimationFrame(passo);
    };
    quadro = requestAnimationFrame(passo);

    return () => {
      cancelAnimationFrame(quadro);
      sonda.desinstalar();
      medidor.reiniciar();
    };
  }, [visivel, medidor]);

  // Publicar a mesma amostra que o painel desenha é o que torna o baseline de
  // `docs/performance.md` reproduzível por script, em vez de raspado da tela.
  // Só existe com o painel aberto.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const janela = window as unknown as Record<string, unknown>;
    if (!visivel) {
      delete janela[GLOBAL_DE_DIAGNOSTICO];
      return;
    }
    janela[GLOBAL_DE_DIAGNOSTICO] = amostra;
    return () => {
      delete janela[GLOBAL_DE_DIAGNOSTICO];
    };
  }, [visivel, amostra]);

  return { visivel, alternar, amostra };
}
