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
import { suportaEntrada } from './adapter-extras.js';
import type { EstadoDoGamepad } from './input/snes-keymap.js';
import { emulatorRegistry } from './emulator-registry.js';
import { SessaoDeEmulacao, type EstadoDeAudio } from './session.js';

/**
 * Enquanto o adapter não existe, o áudio é reportado como bloqueado.
 *
 * É o palpite seguro: a página acabou de abrir e o navegador ainda não viu
 * gesto nenhum. Assumir liberado faria a UI esconder o convite para destravar
 * exatamente no instante em que ele é mais necessário.
 */
const AUDIO_INICIAL: EstadoDeAudio = { volume: 1, muted: false, blocked: true };

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
  definirMudo(mudo: boolean): void;
  /** Deve ser chamado de dentro do manipulador do clique. Diz se destravou. */
  destravarAudio(): Promise<boolean>;
  definirGamepad(estado: EstadoDoGamepad): void;
}

export interface MarcoDeStatus {
  readonly status: EmulatorStatus;
  /** `performance.now()` do instante exato da transição. */
  readonly instanteMs: number;
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
  /** Volume, mudo e bloqueio de autoplay, como o adapter os reporta. */
  readonly audio: EstadoDeAudio;
  readonly comandos: ComandosDoEmulador;
  /** Recomeça do zero. É a ação da tela de erro. */
  readonly reiniciar: () => void;
  /**
   * Instante de cada transição de status desta sessão, do `idle` em diante.
   *
   * O `status` acima é sempre o **último** de uma rajada: `mount` e `loadGame`
   * acontecem na mesma cadeia de promessas, e o React funde as atualizações
   * intermediárias antes de renderizar — quem só olha o estado nunca vê
   * `mounted` acontecer. Medir quanto durou cada etapa da carga exige o
   * instante da transição, não o estado que sobrou. Ver `debug/load-timeline.ts`.
   *
   * É função, e não estado, de propósito. A lista muda a cada transição e nada
   * na tela depende dela — quem a lê é o laço de quadros do diagnóstico, que
   * não pode disparar render a cada leitura.
   */
  readonly lerMarcos: () => readonly MarcoDeStatus[];
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
  // Espelha o que o adapter reporta por `audioChange`. Não é a fonte da
  // verdade — quem manda é o adapter, e o evento é como ele conta.
  const [audio, setAudio] = useState<EstadoDeAudio>(AUDIO_INICIAL);
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
  const marcosRef = useRef<MarcoDeStatus[]>([]);

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
    marcosRef.current = [{ status: 'idle', instanteMs: performance.now() }];
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
          aoMudarStatus: (novo) => {
            marcosRef.current.push({ status: novo, instanteMs: performance.now() });
            setStatus(novo);
          },
          aoFalhar: setErro,
          aoMedirFps: setFps,
          aoGravarSram: () => setUltimaGravacaoDeSram(Date.now()),
          aoMudarAudio: setAudio,
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
        adapter?.audio.setVolume(volume);
      },
      definirMudo: (mudo) => {
        adapter?.audio.setMuted(mudo);
      },
      // Precisa ser chamado de DENTRO do manipulador do clique: fora de um
      // gesto do usuário o navegador recusa, e é por isso que o retorno diz
      // se destravou em vez de resolver calado.
      destravarAudio: async () => (await adapter?.audio.unlock()) ?? false,
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
  const lerMarcos = useCallback((): readonly MarcoDeStatus[] => marcosRef.current, []);

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
    audio,
    comandos,
    reiniciar,
    lerMarcos,
  };
}
