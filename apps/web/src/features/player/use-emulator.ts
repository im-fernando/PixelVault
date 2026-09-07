import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import {
  NO_CAPABILITIES,
  describeRomSource,
  type EmulatorAdapter,
  type EmulatorCapabilities,
  type EmulatorError,
  type EmulatorRegistry,
  type EmulatorStatus,
  type RomSource,
} from '@pixelvault/emulator-runtime';
import { suportaEntrada, suportaVolume } from './adapter-extras.js';
import type { EstadoDoGamepad } from './input/snes-keymap.js';
import { emulatorRegistry } from './emulator-registry.js';
import { SessaoDeEmulacao } from './session.js';

export interface OpcoesDoEmulador {
  readonly systemId: SystemId;
  readonly rom: RomSource;
  /** Injetável para teste; em produção é sempre o registry da aplicação. */
  readonly registry?: EmulatorRegistry | undefined;
}

export interface ComandosDoEmulador {
  iniciar(): Promise<void>;
  pausar(): void;
  retomar(): void;
  alternarPausa(): void;
  resetar(): void;
  exportarEstado(): Promise<Uint8Array>;
  importarEstado(dados: Uint8Array): Promise<void>;
  exportarSram(): Promise<Uint8Array>;
  capturarQuadro(): Promise<Blob>;
  definirVolume(volume: number): void;
  definirGamepad(estado: EstadoDoGamepad): void;
}

export interface Emulador {
  readonly canvasRef: RefObject<HTMLCanvasElement | null>;
  readonly status: EmulatorStatus;
  readonly capabilities: EmulatorCapabilities;
  readonly coreVersion: string | null;
  readonly erro: EmulatorError | null;
  readonly fps: number | null;
  readonly ultimaGravacaoDeSram: number | null;
  /** A pausa veio da aba oculta, não da pessoa. Muda a mensagem na tela. */
  readonly pausadoPelaAba: boolean;
  readonly abaVisivel: boolean;
  readonly controlaVolume: boolean;
  readonly comandos: ComandosDoEmulador;
  /** Recomeça do zero. É a ação da tela de erro. */
  readonly reiniciar: () => void;
}

/** Estados em que faz sentido pedir save state, SRAM ou reset. */
const COM_ROM: readonly EmulatorStatus[] = ['ready', 'running', 'paused'];

function abaVisivelAgora(): boolean {
  return typeof document === 'undefined' || document.visibilityState === 'visible';
}

/**
 * Chave estável da fonte da ROM.
 *
 * O efeito precisa recriar a sessão quando a ROM muda e **só** quando ela
 * muda. O objeto `RomSource` é remontado a cada render, então comparar por
 * identidade recriaria o emulador a cada tecla digitada em qualquer lugar da
 * página.
 */
function chaveDaFonte(rom: RomSource): string {
  return rom.kind === 'url' ? `url:${rom.url}` : describeRomSource(rom);
}

/**
 * Liga o ciclo de vida do emulador ao ciclo de vida do componente.
 *
 * Toda a parte difícil — a sequência assíncrona cancelável — mora em
 * `SessaoDeEmulacao`. O que sobra aqui é o que só o React precisa: espelhar o
 * `status` do adapter em estado de renderização, serializar troca de sessão e
 * pausar quando a aba some.
 */
export function useEmulator({ systemId, rom, registry }: OpcoesDoEmulador): Emulador {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const romRef = useRef<RomSource>(rom);
  romRef.current = rom;

  const [adapter, setAdapter] = useState<EmulatorAdapter | null>(null);
  const [status, setStatus] = useState<EmulatorStatus>('idle');
  const [erro, setErro] = useState<EmulatorError | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  const [ultimaGravacaoDeSram, setUltimaGravacaoDeSram] = useState<number | null>(null);
  const [abaVisivel, setAbaVisivel] = useState(abaVisivelAgora);
  const [geracao, setGeracao] = useState(0);

  const pausadoPelaAbaRef = useRef(false);
  const [pausadoPelaAba, setPausadoPelaAba] = useState(false);
  /**
   * Fila de sessões: o cleanup de uma montagem e a criação da próxima não
   * podem se cruzar. Sem isso, o StrictMode monta o segundo adapter no mesmo
   * canvas enquanto o primeiro ainda está sendo destruído — e é assim que
   * nasce contexto WebGL vazado.
   */
  const fila = useRef<Promise<unknown>>(Promise.resolve());

  const registryEfetivo = registry ?? emulatorRegistry;
  const chaveDaRom = chaveDaFonte(rom);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) return;

    let sessao: SessaoDeEmulacao | null = null;
    let cancelado = false;

    setErro(null);
    setFps(null);
    setStatus('idle');
    pausadoPelaAbaRef.current = false;
    setPausadoPelaAba(false);

    const execucao = fila.current.then(async () => {
      if (cancelado) return;
      sessao = SessaoDeEmulacao.iniciar({
        registry: registryEfetivo,
        systemId,
        rom: romRef.current,
        canvas,
        iniciarAutomaticamente: abaVisivelAgora(),
        observador: {
          aoMudarStatus: setStatus,
          aoFalhar: setErro,
          aoMedirFps: setFps,
          aoGravarSram: () => setUltimaGravacaoDeSram(Date.now()),
          aoAbrir: setAdapter,
        },
      });
      await sessao.pronta;
    });
    fila.current = execucao;

    return () => {
      cancelado = true;
      setAdapter(null);
      fila.current = execucao.then(() => sessao?.descartar()).catch(() => undefined);
    };
  }, [registryEfetivo, systemId, chaveDaRom, geracao]);

  // A aba oculta pausa a emulação. Não é economia de bateria: é a fundação do
  // playtime honesto da M6, onde o servidor só credita tempo com aba visível.
  useEffect(() => {
    const aoMudarVisibilidade = (): void => {
      const visivel = abaVisivelAgora();
      setAbaVisivel(visivel);

      const atual = adapter;
      if (atual === null) return;

      if (!visivel && atual.status === 'running') {
        atual.pause();
        pausadoPelaAbaRef.current = true;
        setPausadoPelaAba(true);
        return;
      }

      if (visivel && pausadoPelaAbaRef.current && atual.status === 'paused') {
        atual.resume();
        pausadoPelaAbaRef.current = false;
        setPausadoPelaAba(false);
        return;
      }

      // A aba estava oculta no boot, então a sessão parou em `ready`. Voltar a
      // ver a página é o consentimento que faltava para começar a contar tempo.
      if (visivel && atual.status === 'ready') void atual.start();
    };

    document.addEventListener('visibilitychange', aoMudarVisibilidade);
    return () => document.removeEventListener('visibilitychange', aoMudarVisibilidade);
  }, [adapter]);

  const exigirAdapter = useCallback((): EmulatorAdapter => {
    const atual = adapter;
    if (atual === null) throw new Error('O emulador ainda não está pronto.');
    return atual;
  }, [adapter]);

  const comandos = useMemo<ComandosDoEmulador>(
    () => ({
      iniciar: async () => {
        const atual = exigirAdapter();
        if (atual.status === 'ready') await atual.start();
      },
      pausar: () => {
        const atual = exigirAdapter();
        if (atual.status === 'running') {
          atual.pause();
          pausadoPelaAbaRef.current = false;
          setPausadoPelaAba(false);
        }
      },
      retomar: () => {
        const atual = exigirAdapter();
        if (atual.status === 'paused') atual.resume();
        else if (atual.status === 'ready') void atual.start();
        pausadoPelaAbaRef.current = false;
        setPausadoPelaAba(false);
      },
      alternarPausa: () => {
        const atual = exigirAdapter();
        if (atual.status === 'running') {
          atual.pause();
        } else if (atual.status === 'paused') {
          atual.resume();
        } else if (atual.status === 'ready') {
          void atual.start();
        }
        pausadoPelaAbaRef.current = false;
        setPausadoPelaAba(false);
      },
      resetar: () => {
        const atual = exigirAdapter();
        if (COM_ROM.includes(atual.status)) atual.reset();
      },
      exportarEstado: async () => exigirAdapter().exportState(),
      importarEstado: async (dados) => exigirAdapter().importState(dados),
      exportarSram: async () => exigirAdapter().exportSram(),
      capturarQuadro: async () => exigirAdapter().captureFrame(),
      definirVolume: (volume) => {
        const atual = adapter;
        if (atual !== null && suportaVolume(atual)) atual.setVolume(volume);
      },
      definirGamepad: (estado) => {
        const atual = adapter;
        if (atual === null || !suportaEntrada(atual)) return;
        for (const [botao, pressionado] of Object.entries(estado)) {
          atual.setButtonState(botao as keyof EstadoDoGamepad, pressionado);
        }
      },
    }),
    [adapter, exigirAdapter],
  );

  const reiniciar = useCallback(() => setGeracao((valor) => valor + 1), []);

  return {
    canvasRef,
    status,
    capabilities: adapter?.capabilities ?? NO_CAPABILITIES,
    coreVersion: adapter?.coreVersion ?? null,
    erro,
    fps,
    ultimaGravacaoDeSram,
    pausadoPelaAba,
    abaVisivel,
    controlaVolume: adapter !== null && suportaVolume(adapter),
    comandos,
    reiniciar,
  };
}
