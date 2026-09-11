import {
  Gamepad2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  Save,
  Upload,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { EmulatorCapabilities, EmulatorStatus } from '@pixelvault/emulator-runtime';
import { PROPORCOES_DISPONIVEIS, type ProporcaoDeTela } from './aspect-ratio.js';
import type { TelaCheia } from './use-fullscreen.js';

export interface AcoesDoHud {
  readonly alternarPausa: () => void;
  readonly resetar: () => void;
  readonly salvarEstado: () => void;
  readonly carregarEstado: () => void;
}

interface Props {
  readonly status: EmulatorStatus;
  readonly capabilities: EmulatorCapabilities;
  readonly visivel: boolean;
  readonly acoes: AcoesDoHud;
  readonly temEstadoSalvo: boolean;
  readonly proporcao: ProporcaoDeTela;
  readonly aoTrocarProporcao: (proporcao: ProporcaoDeTela) => void;
  readonly escalaInteira: boolean;
  readonly aoAlternarEscalaInteira: () => void;
  readonly telaCheia: TelaCheia;
  readonly mudo: boolean;
  readonly audioBloqueado: boolean;
  readonly aoTrocarMudo: (mudo: boolean) => void;
  readonly aoDestravarAudio: () => void;
  readonly volume: number;
  readonly aoTrocarVolume: (volume: number) => void;
  /** Nome do controle em uso, ou `null` quando só há teclado. */
  readonly controle: string | null;
}

const COM_ROM: readonly EmulatorStatus[] = ['ready', 'running', 'paused'];

/**
 * O HUD do PixelVault, e não o do runtime.
 *
 * Cada botão pergunta a `capabilities` antes de existir. Um core que não faz
 * save state não ganha um botão desabilitado com explicação: ganha ausência.
 * Botão que existe e não funciona é promessa quebrada, e a pessoa só descobre
 * na hora em que precisava do save.
 *
 * É a barra flutuante do console, na base do palco: vidro escuro, canto
 * redondo, e a tecla de atalho dentro de cada botão — a mesma gramática do
 * "Iniciar jogo ↵" do modo console, para quem transita entre os dois lados
 * não ter que aprender duas interfaces.
 */
export function PlayerHud({
  status,
  capabilities,
  visivel,
  acoes,
  temEstadoSalvo,
  proporcao,
  aoTrocarProporcao,
  escalaInteira,
  aoAlternarEscalaInteira,
  telaCheia,
  mudo,
  audioBloqueado,
  aoTrocarMudo,
  aoDestravarAudio,
  volume,
  aoTrocarVolume,
  controle,
}: Props) {
  const temRom = COM_ROM.includes(status);
  const rodando = status === 'running';

  return (
    <div
      // `hidden` não serve: o HUD precisa continuar alcançável por Tab, e um
      // painel que some da árvore de acessibilidade quebra quem só usa teclado.
      className={`pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 transition-opacity duration-300 ${
        visivel ? 'opacity-100' : 'opacity-0 focus-within:opacity-100'
      }`}
    >
      <div className="pv-hud pointer-events-auto">
        <BotaoDoHud
          rotulo={rodando ? 'Pausar' : 'Jogar'}
          atalho="Espaço"
          desabilitado={!temRom}
          aoClicar={acoes.alternarPausa}
          destaque={!rodando && temRom}
        >
          {rodando ? <Pause size={15} /> : <Play size={15} fill="currentColor" />}
        </BotaoDoHud>

        <BotaoDoHud rotulo="Reiniciar" atalho="R" desabilitado={!temRom} aoClicar={acoes.resetar}>
          <RotateCcw size={15} />
        </BotaoDoHud>

        {capabilities.saveState && (
          <>
            <Separador />
            <BotaoDoHud
              rotulo="Salvar estado"
              atalho="F2"
              desabilitado={!temRom}
              aoClicar={acoes.salvarEstado}
            >
              <Save size={15} />
            </BotaoDoHud>
            <BotaoDoHud
              rotulo="Carregar estado"
              atalho="F4"
              desabilitado={!temRom || !temEstadoSalvo}
              aoClicar={acoes.carregarEstado}
            >
              <Upload size={15} />
            </BotaoDoHud>
          </>
        )}

        <Separador />

        <div className="flex items-center" role="group" aria-label="Proporção de tela">
          {PROPORCOES_DISPONIVEIS.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => aoTrocarProporcao(valor)}
              aria-pressed={proporcao === valor}
              className="pv-hud-botao px-2.5 tabular-nums"
            >
              {valor}
            </button>
          ))}
          <button
            type="button"
            onClick={aoAlternarEscalaInteira}
            aria-pressed={escalaInteira}
            title="Escala inteira: cada pixel do console vira o mesmo número de pixels na tela"
            className="pv-hud-botao px-2.5 tabular-nums"
          >
            1:N
          </button>
        </div>

        <Separador />
        {audioBloqueado ? (
          /*
            O navegador não deixa o áudio começar sem gesto do usuário. Isso
            não é erro, e deixar o jogo mudo sem explicação seria pior: o botão
            É o gesto, e `unlock()` roda de dentro do clique porque fora dele o
            navegador recusa.
          */
          <button
            type="button"
            onClick={aoDestravarAudio}
            className="pv-hud-botao pv-hud-botao--destaque"
            title="O navegador bloqueou o som até você interagir com a página"
          >
            <Volume2 size={15} /> Ativar som
          </button>
        ) : (
          <div className="flex items-center gap-1 pr-2">
            <button
              type="button"
              onClick={() => aoTrocarMudo(!mudo)}
              className="pv-hud-botao px-2.5"
              title={mudo ? 'Reativar som' : 'Silenciar'}
              aria-label={mudo ? 'Reativar som' : 'Silenciar'}
              aria-pressed={mudo}
            >
              {mudo ? <VolumeX size={15} /> : <Volume2 size={15} />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={Math.round(volume * 100)}
              onChange={(evento) => aoTrocarVolume(Number(evento.target.value) / 100)}
              aria-label="Volume"
              className="pv-faixa w-20 disabled:opacity-40"
              disabled={mudo}
            />
          </div>
        )}

        {/*
          O indicador vive aqui, e não só na legenda abaixo do palco, porque em
          tela cheia o palco é a tela inteira: é justamente quando a legenda
          some que saber qual controle o jogo está lendo importa.
        */}
        {controle !== null && (
          <>
            <Separador />
            <span title={`Controle ativo: ${controle}`} className="pv-chip pv-chip--luz">
              <Gamepad2 size={13} className="shrink-0" />
              <span className="hidden max-w-32 truncate md:inline">{controle}</span>
            </span>
          </>
        )}

        {telaCheia.disponivel && (
          <>
            <Separador />
            <BotaoDoHud
              rotulo={telaCheia.ativa ? 'Sair da tela cheia' : 'Tela cheia'}
              atalho="F"
              aoClicar={telaCheia.alternar}
            >
              {telaCheia.ativa ? <Minimize size={15} /> : <Maximize size={15} />}
            </BotaoDoHud>
          </>
        )}
      </div>
    </div>
  );
}

interface PropsDoBotao {
  readonly rotulo: string;
  readonly atalho: string;
  readonly desabilitado?: boolean;
  readonly destaque?: boolean;
  readonly aoClicar: () => void;
  readonly children: ReactNode;
}

function BotaoDoHud({
  rotulo,
  atalho,
  desabilitado = false,
  destaque = false,
  aoClicar,
  children,
}: PropsDoBotao) {
  return (
    <button
      type="button"
      onClick={aoClicar}
      disabled={desabilitado}
      title={`${rotulo} (${atalho})`}
      aria-label={`${rotulo} — atalho ${atalho}`}
      className={`pv-hud-botao ${destaque ? 'pv-hud-botao--destaque' : ''}`}
    >
      {children}
      <span className="hidden sm:inline">{rotulo}</span>
      <kbd className="pv-tecla pv-player-atalho hidden md:inline-grid">{atalho}</kbd>
    </button>
  );
}

function Separador() {
  return <span aria-hidden className="pv-hud-separador" />;
}
