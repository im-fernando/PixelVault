import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { SystemId } from '@pixelvault/contracts';
import { type EmulatorRegistry, type RomSource } from '@pixelvault/emulator-runtime';
import { PROPORCOES, RESOLUCAO_NATIVA, type ProporcaoDeTela } from './aspect-ratio.js';
import { ATALHO_DE_DIAGNOSTICO, DiagnosticsOverlay, useDiagnostico } from './debug/index.js';
import { GamepadLegend } from './GamepadLegend.js';
import { PlayerHud, type AcoesDoHud } from './PlayerHud.js';
import type { EstadoDoGamepad } from './input/snes-keymap.js';
import { useEntradaDoJogador } from './input/use-player-input.js';
import { useAreaDeExibicao } from './use-display-area.js';
import { GaleriaDeSlots } from './GaleriaDeSlots.js';
import { useEmulator } from './use-emulator.js';
import { useSaves } from './use-saves.js';
import { useFullscreen } from './use-fullscreen.js';

export interface PropsDoPlayer {
  readonly systemId: SystemId;
  readonly rom: RomSource;
  readonly titulo: string;
  /**
   * Identidade da ROM para o armazenamento de save — o SHA-256, que é a mesma
   * identidade canônica que o catálogo usa. Sem ele não há save persistido:
   * gravar progresso sob chave que muda entre sessões é perder progresso.
   */
  readonly romId?: string | undefined;
  /** Injetável para teste. Em produção, o registry da aplicação. */
  readonly registry?: EmulatorRegistry | undefined;
}

/** Tempo sem mexer o mouse até o HUD sair da frente do jogo. */
const MILISSEGUNDOS_ATE_ESCONDER_O_HUD = 2500;
const MILISSEGUNDOS_DO_AVISO = 4000;

/**
 * O único lugar do `apps/web` que conhece o ciclo de vida do emulador.
 *
 * Tudo que fala com o core passa por aqui: nem a rota, nem a biblioteca, nem o
 * HUD sabem que existe um adapter. É o que permite trocar o runtime inteiro —
 * ou rodar a tela contra o adapter falso — sem tocar em mais nada.
 */
export function EmulatorPlayer({ systemId, rom, titulo, romId, registry }: PropsDoPlayer) {
  const emulador = useEmulator({ systemId, rom, registry });
  const saves = useSaves(emulador.adapter, romId ?? null);
  const { status, capabilities, comandos } = emulador;

  const palcoRef = useRef<HTMLDivElement | null>(null);
  const areaRef = useRef<HTMLDivElement | null>(null);
  const telaCheia = useFullscreen(palcoRef);

  const [proporcao, setProporcao] = useState<ProporcaoDeTela>('4:3');
  const [escalaInteira, setEscalaInteira] = useState(false);
  const area = useAreaDeExibicao(areaRef, proporcao, escalaInteira);

  const [focado, setFocado] = useState(false);
  const [hudVisivel, setHudVisivel] = useState(true);
  const [aviso, setAviso] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.8);

  const rodando = status === 'running';
  const teclado = rodando && emulador.abaVisivel && focado;

  const diagnostico = useDiagnostico({
    status,
    fpsDoCore: emulador.fps,
    coreVersion: emulador.coreVersion,
    lerMarcos: emulador.lerMarcos,
  });

  const aoMudarGamepad = useCallback(
    (estado: EstadoDoGamepad) => comandos.definirGamepad(estado),
    [comandos],
  );

  /*
    O atalho grava sempre no slot A. Quem quer escolher usa a galeria — atalho
    que pede para escolher slot não é atalho.
  */
  const salvarEstado = useCallback(() => {
    void saves.salvar(0).then(setAviso);
  }, [saves]);

  const carregarEstado = useCallback(() => {
    void saves.carregar(0).then(setAviso);
  }, [saves]);

  const acoes = useMemo<AcoesDoHud>(
    () => ({
      alternarPausa: () => comandos.alternarPausa(),
      resetar: () => comandos.resetar(),
      salvarEstado,
      carregarEstado,
    }),
    [comandos, salvarEstado, carregarEstado],
  );

  const atalhos = useMemo<Record<string, () => void>>(() => {
    const mapa: Record<string, () => void> = {
      Space: acoes.alternarPausa,
      KeyR: acoes.resetar,
      KeyF: telaCheia.alternar,
      [ATALHO_DE_DIAGNOSTICO]: diagnostico.alternar,
    };
    // Mesma regra do HUD: atalho para o que o core não faz é armadilha.
    if (capabilities.saveState) {
      mapa['F2'] = acoes.salvarEstado;
      mapa['F4'] = acoes.carregarEstado;
    }
    return mapa;
  }, [acoes, capabilities.saveState, telaCheia, diagnostico.alternar]);

  // O controle não pede foco: ele não é compartilhado com o navegador nem com o
  // resto da página, então exigir clique na tela seria inventar uma trava que só
  // o teclado precisa ter.
  const { estado: gamepad, controle } = useEntradaDoJogador({
    alvo: palcoRef,
    tecladoAtivo: teclado,
    controleAtivo: rodando && emulador.abaVisivel,
    aoMudar: aoMudarGamepad,
    atalhos,
    aoConectarControle: (perfil) => setAviso(`Controle conectado: ${perfil.nome}.`),
    aoDesconectarControle: (perfil) => setAviso(`${perfil.nome} desconectado — o teclado assume.`),
  });

  useEffect(() => {
    comandos.definirVolume(volume);
  }, [comandos, volume]);

  // O HUD sai da frente enquanto o jogo anda e volta ao primeiro movimento do
  // mouse. Só enquanto anda: com o jogo parado, sumir seria esconder a saída.
  useEffect(() => {
    if (!rodando) {
      setHudVisivel(true);
      return;
    }
    const palco = palcoRef.current;
    if (palco === null) return;

    let temporizador = window.setTimeout(
      () => setHudVisivel(false),
      MILISSEGUNDOS_ATE_ESCONDER_O_HUD,
    );
    const acordar = (): void => {
      setHudVisivel(true);
      window.clearTimeout(temporizador);
      temporizador = window.setTimeout(
        () => setHudVisivel(false),
        MILISSEGUNDOS_ATE_ESCONDER_O_HUD,
      );
    };

    palco.addEventListener('mousemove', acordar);
    palco.addEventListener('touchstart', acordar);
    return () => {
      window.clearTimeout(temporizador);
      palco.removeEventListener('mousemove', acordar);
      palco.removeEventListener('touchstart', acordar);
    };
  }, [rodando]);

  useEffect(() => {
    if (aviso === null) return;
    const temporizador = window.setTimeout(() => setAviso(null), MILISSEGUNDOS_DO_AVISO);
    return () => window.clearTimeout(temporizador);
  }, [aviso]);

  // Foco uma vez por partida: dar foco a cada mudança de status roubaria o
  // teclado de quem está navegando pelo HUD com Tab.
  const focoInicialRef = useRef(false);
  useEffect(() => {
    if (focoInicialRef.current) return;
    if (status !== 'ready' && status !== 'running') return;
    focoInicialRef.current = true;
    palcoRef.current?.focus({ preventScroll: true });
  }, [status]);

  const estiloDaTela =
    area.largura > 0
      ? { width: `${area.largura}px`, height: `${area.altura}px` }
      : { aspectRatio: PROPORCOES[proporcao], maxWidth: '100%', maxHeight: '100%' };

  return (
    <div className="flex flex-col gap-4">
      <div
        ref={palcoRef}
        tabIndex={0}
        role="application"
        aria-label={`${titulo} — área de jogo`}
        onFocus={() => setFocado(true)}
        onBlur={(evento) => {
          if (evento.currentTarget.contains(evento.relatedTarget)) return;
          setFocado(false);
        }}
        className={`relative overflow-hidden bg-black outline-none transition-colors ${
          telaCheia.ativa ? 'h-screen w-screen border-0' : 'rounded-xl border'
        } ${focado ? 'border-alert' : 'border-ink-850'} ${
          rodando && !hudVisivel ? 'cursor-none' : ''
        }`}
      >
        <div
          ref={areaRef}
          // Em tela cheia a área é a tela inteira. Manter o teto de 70vh aqui
          // seria pedir tela cheia e receber a mesma imagem com tarja preta.
          className={`flex w-full items-center justify-center ${
            telaCheia.ativa ? 'h-full' : 'aspect-video max-h-[70vh]'
          }`}
        >
          <canvas
            ref={emulador.canvasRef}
            width={RESOLUCAO_NATIVA.largura}
            height={RESOLUCAO_NATIVA.altura}
            aria-label={`Tela do ${titulo}`}
            style={estiloDaTela}
            // `pixelated`: interpolação bilinear em arte feita pixel a pixel é
            // o borrão que faz o jogo antigo parecer mal digitalizado.
            className="block [image-rendering:pixelated]"
          />
        </div>

        <SobreposicaoDeEstado
          status={status}
          erroCode={emulador.erro?.code ?? null}
          erroMensagem={emulador.erro?.message ?? null}
          pausadoPelaAba={emulador.pausadoPelaAba}
          aoJogar={() => comandos.alternarPausa()}
          aoTentarDeNovo={emulador.reiniciar}
        />

        {diagnostico.amostra !== null && (
          <DiagnosticsOverlay amostra={diagnostico.amostra} aoFechar={diagnostico.alternar} />
        )}

        {aviso !== null && (
          <p
            role="status"
            className="absolute inset-x-0 top-0 mx-auto mt-3 w-fit rounded-full border border-ink-850 bg-ink-950/90 px-3 py-1 text-xs text-label-100"
          >
            {aviso}
          </p>
        )}

        <PlayerHud
          status={status}
          capabilities={capabilities}
          visivel={hudVisivel || !rodando}
          acoes={acoes}
          temEstadoSalvo={saves.slots.some((slot) => slot.metadata !== null)}
          proporcao={proporcao}
          aoTrocarProporcao={setProporcao}
          escalaInteira={escalaInteira}
          aoAlternarEscalaInteira={() => setEscalaInteira((valor) => !valor)}
          telaCheia={telaCheia}
          volume={volume}
          aoTrocarVolume={setVolume}
          mudo={emulador.audio.muted}
          audioBloqueado={emulador.audio.blocked}
          aoTrocarMudo={(mudo) => emulador.comandos.definirMudo(mudo)}
          aoDestravarAudio={() => void emulador.comandos.destravarAudio()}
          controle={controle?.nome ?? null}
        />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-700">
        <span>
          Estado: <strong className="text-ink-500">{ROTULO_DO_STATUS[status]}</strong>
        </span>
        {emulador.coreVersion !== null && <span>Core: {emulador.coreVersion}</span>}
        {emulador.fps !== null && <span>{emulador.fps} fps</span>}
        {emulador.ultimaGravacaoDeSram !== null && (
          <span>
            SRAM gravada às {new Date(emulador.ultimaGravacaoDeSram).toLocaleTimeString('pt-BR')}
          </span>
        )}
        {saves.driver !== null && <span>save: {saves.driver}</span>}
        {!emulador.abaVisivel && <span>aba oculta — emulação pausada</span>}
      </div>

      {capabilities.saveState && romId !== undefined && (
        <GaleriaDeSlots
          slots={saves.slots}
          volatil={saves.volatil}
          aoSalvar={(slot) => void saves.salvar(slot).then(setAviso)}
          aoCarregar={(slot) => void saves.carregar(slot).then(setAviso)}
          aoApagar={(slot) => void saves.apagar(slot).then(setAviso)}
        />
      )}

      <GamepadLegend estado={gamepad} ativo={teclado} controle={controle} />
    </div>
  );
}

const ROTULO_DO_STATUS: Record<string, string> = {
  idle: 'carregando core',
  mounted: 'core pronto',
  loading: 'carregando ROM',
  ready: 'pronto',
  running: 'rodando',
  paused: 'pausado',
  destroyed: 'encerrado',
};

interface PropsDaSobreposicao {
  readonly status: string;
  readonly erroCode: string | null;
  readonly erroMensagem: string | null;
  readonly pausadoPelaAba: boolean;
  readonly aoJogar: () => void;
  readonly aoTentarDeNovo: () => void;
}

/**
 * Os estados explícitos do contrato virando tela.
 *
 * Lê `status`, e não a sequência de eventos que passou: quem monta a tela
 * depois de um `resume` precisa ver o mesmo que quem estava aqui desde o
 * começo.
 */
function SobreposicaoDeEstado({
  status,
  erroCode,
  erroMensagem,
  pausadoPelaAba,
  aoJogar,
  aoTentarDeNovo,
}: PropsDaSobreposicao) {
  if (erroCode !== null) {
    return (
      <Cobertura>
        <p className="font-mono text-xs tracking-widest text-alert uppercase">{erroCode}</p>
        <p className="mt-2 max-w-sm text-sm text-label-100">{erroMensagem}</p>
        <button
          type="button"
          onClick={aoTentarDeNovo}
          className="mt-4 rounded-md bg-alert px-4 py-2 text-sm font-semibold text-ink-950 hover:brightness-110"
        >
          Tentar de novo
        </button>
      </Cobertura>
    );
  }

  if (status === 'idle' || status === 'mounted' || status === 'loading') {
    return (
      <Cobertura>
        <span
          aria-hidden
          className="h-6 w-6 animate-spin rounded-full border-2 border-ink-700 border-t-alert"
        />
        <p className="mt-3 text-sm text-ink-500">
          {status === 'loading' ? 'Carregando a ROM…' : 'Subindo o core…'}
        </p>
      </Cobertura>
    );
  }

  if (status === 'ready') {
    return (
      <Cobertura>
        <button
          type="button"
          onClick={aoJogar}
          className="rounded-full bg-alert px-6 py-3 text-sm font-semibold text-ink-950 hover:brightness-110"
        >
          Jogar
        </button>
      </Cobertura>
    );
  }

  if (status === 'paused') {
    return (
      <Cobertura>
        <p className="text-sm font-semibold text-label-100">Pausado</p>
        <p className="mt-1 text-xs text-ink-500">
          {pausadoPelaAba
            ? 'A aba saiu de vista. O tempo de jogo só conta com a aba visível.'
            : 'Espaço para voltar ao jogo.'}
        </p>
      </Cobertura>
    );
  }

  return null;
}

function Cobertura({ children }: { readonly children: ReactNode }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink-950/85 text-center">
      {children}
    </div>
  );
}
