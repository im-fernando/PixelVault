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
  readonly controlaVolume: boolean;
  readonly volume: number;
  readonly aoTrocarVolume: (volume: number) => void;
}

const COM_ROM: readonly EmulatorStatus[] = ['ready', 'running', 'paused'];

/**
 * O HUD do PixelVault, e não o do runtime.
 *
 * Cada botão pergunta a `capabilities` antes de existir. Um core que não faz
 * save state não ganha um botão desabilitado com explicação: ganha ausência.
 * Botão que existe e não funciona é promessa quebrada, e a pessoa só descobre
 * na hora em que precisava do save.
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
  controlaVolume,
  volume,
  aoTrocarVolume,
}: Props) {
  const temRom = COM_ROM.includes(status);
  const rodando = status === 'running';

  return (
    <div
      // `hidden` não serve: o HUD precisa continuar alcançável por Tab, e um
      // painel que some da árvore de acessibilidade quebra quem só usa teclado.
      className={`pointer-events-none absolute inset-x-0 bottom-0 flex justify-center p-3 transition-opacity duration-300 ${
        visivel ? 'opacity-100' : 'opacity-0 focus-within:opacity-100'
      }`}
    >
      <div className="pointer-events-auto flex max-w-full flex-wrap items-center gap-1 rounded-xl border border-vault-800 bg-vault-950/90 p-1.5 shadow-lg backdrop-blur">
        <BotaoDoHud
          rotulo={rodando ? 'Pausar' : 'Jogar'}
          atalho="Espaço"
          desabilitado={!temRom}
          aoClicar={acoes.alternarPausa}
          destaque={!rodando && temRom}
        >
          {rodando ? <IconePausa /> : <IconePlay />}
        </BotaoDoHud>

        <BotaoDoHud rotulo="Reiniciar" atalho="R" desabilitado={!temRom} aoClicar={acoes.resetar}>
          <IconeReset />
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
              <IconeSalvar />
            </BotaoDoHud>
            <BotaoDoHud
              rotulo="Carregar estado"
              atalho="F4"
              desabilitado={!temRom || !temEstadoSalvo}
              aoClicar={acoes.carregarEstado}
            >
              <IconeCarregar />
            </BotaoDoHud>
          </>
        )}

        <Separador />

        <div className="flex items-center gap-0.5 px-1" role="group" aria-label="Proporção de tela">
          {PROPORCOES_DISPONIVEIS.map((valor) => (
            <button
              key={valor}
              type="button"
              onClick={() => aoTrocarProporcao(valor)}
              aria-pressed={proporcao === valor}
              className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${
                proporcao === valor
                  ? 'bg-accent/20 text-vault-100'
                  : 'text-vault-300 hover:bg-vault-800'
              }`}
            >
              {valor}
            </button>
          ))}
          <button
            type="button"
            onClick={aoAlternarEscalaInteira}
            aria-pressed={escalaInteira}
            title="Escala inteira: cada pixel do console vira o mesmo número de pixels na tela"
            className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${
              escalaInteira ? 'bg-accent/20 text-vault-100' : 'text-vault-300 hover:bg-vault-800'
            }`}
          >
            1:N
          </button>
        </div>

        {controlaVolume && (
          <>
            <Separador />
            <label className="flex items-center gap-2 px-2 text-vault-300">
              <span className="sr-only">Volume</span>
              <IconeVolume />
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volume * 100)}
                onChange={(evento) => aoTrocarVolume(Number(evento.target.value) / 100)}
                className="h-1 w-20 accent-[var(--color-accent)]"
              />
            </label>
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
              <IconeTelaCheia />
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
      className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
        destaque
          ? 'bg-accent text-vault-950 hover:brightness-110'
          : 'text-vault-300 hover:bg-vault-800 hover:text-vault-100'
      }`}
    >
      {children}
      <span className="hidden sm:inline">{rotulo}</span>
      <kbd className="hidden font-mono text-[0.6rem] text-vault-700 md:inline">{atalho}</kbd>
    </button>
  );
}

function Separador() {
  return <span aria-hidden className="mx-0.5 h-5 w-px bg-vault-800" />;
}

const SVG = 'h-4 w-4 shrink-0';

function IconePlay() {
  return (
    <svg className={SVG} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4 2.5v11l9-5.5-9-5.5Z" />
    </svg>
  );
}

function IconePausa() {
  return (
    <svg className={SVG} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M4 2.5h3v11H4zM9 2.5h3v11H9z" />
    </svg>
  );
}

function IconeReset() {
  return (
    <svg
      className={SVG}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M13.5 8a5.5 5.5 0 1 1-1.9-4.2" strokeLinecap="round" />
      <path d="M13.5 1.5v3.2h-3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconeSalvar() {
  return (
    <svg
      className={SVG}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M8 2v8m0 0 3-3m-3 3L5 7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 11v2.5h11V11" strokeLinecap="round" />
    </svg>
  );
}

function IconeCarregar() {
  return (
    <svg
      className={SVG}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path d="M8 13V5m0 0L5 8m3-3 3 3" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M2.5 3h11" strokeLinecap="round" />
    </svg>
  );
}

function IconeVolume() {
  return (
    <svg className={SVG} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M7 2.5 4 5.5H2v5h2l3 3v-11Z" />
      <path
        d="M9.8 5.5a3.5 3.5 0 0 1 0 5M11.8 3.5a6 6 0 0 1 0 9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinecap="round"
      />
    </svg>
  );
}

function IconeTelaCheia() {
  return (
    <svg
      className={SVG}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden
    >
      <path
        d="M2.5 6V2.5H6M10 2.5h3.5V6M13.5 10v3.5H10M6 13.5H2.5V10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
