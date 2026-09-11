import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Cloud,
  Gamepad2,
  HardDrive,
  Maximize,
  Monitor,
  Pause,
  Play,
  RotateCcw,
  Save,
  Settings2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { EmulatorStatus } from '@pixelvault/emulator-runtime';
import { PROPORCOES_DISPONIVEIS, type ProporcaoDeTela } from '../player/aspect-ratio.js';
import type { SincronizacaoDeSaveStates } from '../player/sincronizacao-de-save-states.js';
import {
  thumbnailUrl,
  revokeThumbnailUrl,
  type SaveSlot,
  type SaveSlotView,
} from '../player/storage/index.js';
import type { Saves } from '../player/use-saves.js';
import type { TelaCheia } from '../player/use-fullscreen.js';
import { ConsoleGameStatus } from './ConsoleGameStatus.js';

export interface ModoConsoleDoPlayer {
  readonly capaUrl: string | null;
  readonly aoSair: () => void;
  readonly progresso: ReactNode;
}

interface Props {
  titulo: string;
  sistema: string;
  modo: ModoConsoleDoPlayer;
  status: EmulatorStatus;
  erro: string | null;
  visivel: boolean;
  aberto: boolean;
  abrir: () => void;
  fechar: () => void;
  retomar: () => void;
  reiniciar: () => void;
  tentar: () => void;
  saves: Saves;
  podeSalvar: boolean;
  nuvem: SincronizacaoDeSaveStates;
  conflito: ReactNode;
  ocupado: boolean;
  aoOcupar: (valor: boolean) => void;
  sair: () => Promise<void>;
  proporcao: ProporcaoDeTela;
  aoTrocarProporcao: (valor: ProporcaoDeTela) => void;
  escalaInteira: boolean;
  aoAlternarEscala: () => void;
  telaCheia: TelaCheia;
  volume: number;
  aoTrocarVolume: (volume: number) => void;
  mudo: boolean;
  aoTrocarMudo: (valor: boolean) => void;
  audioBloqueado: boolean;
  ativarAudio: () => void;
}

export function ConsoleGameOverlay(props: Props) {
  const carregando = ['idle', 'mounted', 'loading', 'destroyed'].includes(props.status);
  if (props.erro || carregando)
    return (
      <ConsoleGameStatus
        titulo={props.titulo}
        detalhe={props.erro ?? 'Preparando o jogo e restaurando seu progresso…'}
        capaUrl={props.modo.capaUrl}
        sair={props.modo.aoSair}
        tentar={props.erro ? props.tentar : undefined}
      />
    );
  if (props.aberto) return <MenuDaPartida {...props} />;
  return (
    <div className="cgp-ingame-ui">
      <div className={`cgp-ingame-bar ${props.visivel ? 'is-visible' : ''}`}>
        <div className="cgp-playing-title">
          <Gamepad2 size={18} />
          <span>
            {props.titulo}
            <small>{props.sistema} · EM JOGO</small>
          </span>
        </div>
        <button
          type="button"
          className="cgp-menu-trigger"
          data-console-sound="abrir"
          onClick={props.abrir}
          aria-label="Abrir menu do console"
        >
          <kbd>L1</kbd>
          <span>+</span>
          <kbd>R1</kbd>
          <span>Menu</span>
          <Pause size={16} />
        </button>
      </div>
      {props.status !== 'running' && (
        <div className="cgp-resume-screen">
          <span className="cx-overline">SEU UNIVERSO ESTÁ ESPERANDO</span>
          <h2>Uma pausa no tempo.</h2>
          <button type="button" className="cx-play" onClick={props.retomar}>
            <Play size={18} />
            Continuar jogando
          </button>
        </div>
      )}
      {(!props.telaCheia.ativa || props.audioBloqueado) && (
        <div className="cgp-permissions">
          {!props.telaCheia.ativa && props.telaCheia.disponivel && (
            <button type="button" onClick={props.telaCheia.alternar}>
              <Maximize size={16} />
              Ativar tela cheia
            </button>
          )}
          {props.audioBloqueado && (
            <button type="button" onClick={props.ativarAudio}>
              <Volume2 size={16} />
              Ativar som
            </button>
          )}
        </div>
      )}
    </div>
  );
}

type Aba = 'sessao' | 'saves' | 'ajustes' | 'nuvem';
type Confirmacao = {
  titulo: string;
  detalhe: string;
  rotulo: string;
  executar: () => Promise<void> | void;
};
const ABAS = [
  { id: 'sessao', nome: 'Sua sessão', Icone: Gamepad2 },
  { id: 'saves', nome: 'Estados salvos', Icone: Save },
  { id: 'ajustes', nome: 'Imagem e som', Icone: Settings2 },
  { id: 'nuvem', nome: 'Progresso', Icone: Cloud },
] as const;

function MenuDaPartida(props: Props) {
  const [aba, setAba] = useState<Aba>('sessao');
  const [confirmacao, setConfirmacao] = useState<Confirmacao | null>(null);
  const [recado, setRecado] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const operacao = useRef(false);
  const [capaFalhou, setCapaFalhou] = useState(false);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>('[data-first-control]')?.focus();
  }, []);
  useEffect(() => {
    // Os atalhos da sessão desaparecem ao trocar de aba. Reposicionar o
    // foco evita que o próximo comando do controle se perca no body.
    const ativo = document.activeElement;
    if (ref.current?.contains(ativo) && !ativo?.matches(':disabled')) return;
    const destino =
      ref.current?.querySelector<HTMLElement>(
        '.cgp-content button:not(:disabled), .cgp-content input:not(:disabled)',
      ) ?? ref.current?.querySelector<HTMLElement>('.cgp-nav [aria-current="page"]');
    destino?.focus();
  }, [aba, props.conflito]);
  useEffect(() => {
    if (!confirmacao) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('.cgp-confirm button')?.focus();
    return () => {
      if (anterior?.isConnected) anterior.focus();
    };
  }, [confirmacao]);

  const executar = async (acao: () => Promise<string | void> | string | void) => {
    if (operacao.current) return;
    operacao.current = true;
    props.aoOcupar(true);
    setRecado(null);
    try {
      const mensagem = await acao();
      if (mensagem) setRecado(mensagem);
    } catch {
      setRecado('Não foi possível concluir a operação. Tente novamente.');
    } finally {
      operacao.current = false;
      props.aoOcupar(false);
      setConfirmacao(null);
    }
  };
  const solicitarSave = (slot: SaveSlotView) => {
    const acao = () => {
      void executar(() => props.saves.salvar(slot.slot));
    };
    if (slot.metadata)
      setConfirmacao({
        titulo: `Substituir o slot ${slot.slot + 1}?`,
        detalhe: 'O estado anterior deste slot será substituído pelo momento atual do jogo.',
        rotulo: 'Substituir estado',
        executar: acao,
      });
    else acao();
  };
  const solicitarCarga = (slot: SaveSlot) =>
    setConfirmacao({
      titulo: `Voltar ao slot ${slot + 1}?`,
      detalhe:
        'O jogo voltará ao momento gravado. O avanço desde então será descartado se não estiver salvo em outro slot.',
      rotulo: 'Carregar estado',
      executar: () => {
        void executar(() => props.saves.carregar(slot));
      },
    });
  const fechar = () => {
    if (props.ocupado) return;
    if (confirmacao) setConfirmacao(null);
    else props.fechar();
  };
  return (
    <div
      className="cgp-overlay"
      ref={ref}
      data-console-game-dialog=""
      role="dialog"
      aria-modal="true"
      aria-label="Menu do console"
    >
      <div className="cgp-pause-atmosphere" aria-hidden="true" />
      <div className="cgp-menu-shell">
        <header className="cgp-menu-head">
          <div>
            <span className="cgp-system-brand">
              PIXELVAULT <i /> SESSÃO PAUSADA
            </span>
            <h2>Seu jogo pode esperar.</h2>
          </div>
          <button
            className="cx-icon-button"
            type="button"
            onClick={fechar}
            disabled={props.ocupado || Boolean(props.conflito)}
            aria-label="Voltar ao jogo"
            data-console-sound="voltar"
          >
            <X size={23} />
          </button>
        </header>
        <div className="cgp-menu-layout" inert={confirmacao !== null}>
          <aside className="cgp-sidebar">
            <div className="cgp-game-identity">
              <div className="cgp-cover">
                {props.modo.capaUrl && !capaFalhou ? (
                  <img src={props.modo.capaUrl} alt="" onError={() => setCapaFalhou(true)} />
                ) : (
                  <Gamepad2 size={40} strokeWidth={1} />
                )}
              </div>
              <div>
                <small>{props.sistema}</small>
                <h3>{props.titulo}</h3>
              </div>
            </div>
            <nav className="cgp-nav" aria-label="Menu da partida">
              {ABAS.filter((a) => a.id !== 'saves' || props.podeSalvar).map(
                ({ id, nome, Icone }) => (
                  <button
                    key={id}
                    type="button"
                    aria-current={aba === id ? 'page' : undefined}
                    disabled={props.ocupado || Boolean(props.conflito)}
                    onClick={() => {
                      setAba(id);
                      setRecado(null);
                    }}
                  >
                    <Icone size={19} />
                    <span>{nome}</span>
                    <ArrowUpRight size={16} />
                  </button>
                ),
              )}
            </nav>
            <p className="cgp-pause-note">
              <span />O jogo está pausado.
              <br />
              Volte no seu tempo.
            </p>
          </aside>
          <div className="cgp-content">
            {props.conflito ? (
              <section className="cgp-progress-panel">
                <p className="cx-overline">ESCOLHA QUAL MOMENTO MANTER</p>
                {props.conflito}
              </section>
            ) : (
              <>
                {aba === 'sessao' && (
                  <section className="cgp-session">
                    <span className="cx-overline">EXATAMENTE ONDE VOCÊ PAROU</span>
                    <h3>
                      Uma pausa.
                      <br />
                      <em>Infinitas possibilidades.</em>
                    </h3>
                    <p>Guarde esse momento, ajuste seu espaço ou volte para a aventura.</p>
                    <button
                      type="button"
                      data-first-control=""
                      className="cgp-resume"
                      data-console-sound="voltar"
                      onClick={props.fechar}
                      disabled={props.ocupado}
                    >
                      <Play size={22} fill="currentColor" />
                      <span>
                        Continuar jogando<small>Voltar à partida</small>
                      </span>
                      <ArrowUpRight size={22} />
                    </button>
                    <div className="cgp-session-actions">
                      {props.podeSalvar && (
                        <button type="button" onClick={() => setAba('saves')}>
                          <Save size={22} />
                          <span>
                            Salvar um momento<small>4 slots de save state</small>
                          </span>
                        </button>
                      )}
                      <button type="button" onClick={() => setAba('ajustes')}>
                        <Monitor size={22} />
                        <span>
                          Do seu jeito<small>Imagem e áudio</small>
                        </span>
                      </button>
                    </div>
                    <div className="cgp-session-bottom">
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmacao({
                            titulo: 'Reiniciar a partida?',
                            detalhe: 'O jogo voltará ao início. Estados não salvos serão perdidos.',
                            rotulo: 'Reiniciar jogo',
                            executar: () => {
                              props.reiniciar();
                              setConfirmacao(null);
                              setRecado('Jogo reiniciado. Continue quando estiver pronto.');
                            },
                          })
                        }
                      >
                        <RotateCcw size={15} />
                        Reiniciar jogo
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setConfirmacao({
                            titulo: 'Voltar à biblioteca?',
                            detalhe:
                              'Estados manuais não salvos serão perdidos. Os saves já gravados continuam disponíveis.',
                            rotulo: 'Voltar ao console',
                            executar: () => {
                              void executar(props.sair);
                            },
                          })
                        }
                      >
                        <ArrowLeft size={15} />
                        Voltar ao console
                      </button>
                    </div>
                  </section>
                )}
                {aba === 'saves' && (
                  <section className="cgp-saves">
                    <div className="cgp-section-heading">
                      <div>
                        <span className="cx-overline">PONTOS DE RETORNO</span>
                        <h3>Guarde esse momento.</h3>
                      </div>
                      <span>{props.saves.slots.filter((s) => s.metadata).length} / 4</span>
                    </div>
                    <p className="cgp-section-description">
                      Salve agora. Volte exatamente para este instante quando quiser.
                    </p>
                    {props.saves.volatil && (
                      <p className="cgp-warning" role="status">
                        Este navegador não guarda os saves ao fechar a aba. Envie os estados para a
                        nuvem para preservá-los.
                      </p>
                    )}
                    <div className="cgp-save-grid">
                      {props.saves.slots.map((slot) => (
                        <SlotDoConsole
                          key={slot.slot}
                          slot={slot}
                          salvar={() => solicitarSave(slot)}
                          carregar={() => solicitarCarga(slot.slot)}
                          ocupado={
                            props.ocupado || !props.saves.pronto || props.nuvem.ocupado !== null
                          }
                          nuvem={props.nuvem}
                        />
                      ))}
                    </div>
                    <p className="cgp-save-caption">
                      <HardDrive size={14} />
                      Save states são gravados neste aparelho. O envio à nuvem é uma ação separada.
                    </p>
                    {props.nuvem.erro && (
                      <p className="cgp-warning" role="alert">
                        {props.nuvem.erro}
                      </p>
                    )}
                  </section>
                )}
                {aba === 'ajustes' && (
                  <section className="cgp-settings">
                    <span className="cx-overline">SEU ESPAÇO DE JOGO</span>
                    <h3>Imagem e som.</h3>
                    <div className="cgp-setting-row">
                      <div>
                        <b>Proporção da imagem</b>
                        <small>Escolha o formato de TV ou a proporção nativa.</small>
                      </div>
                      <div className="cgp-segments">
                        {PROPORCOES_DISPONIVEIS.map((p) => (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={props.proporcao === p}
                            onClick={() => props.aoTrocarProporcao(p)}
                          >
                            {p}
                          </button>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      className="cgp-setting-row cgp-setting-button"
                      role="switch"
                      aria-checked={props.escalaInteira}
                      onClick={props.aoAlternarEscala}
                    >
                      <span>
                        <b>Pixels perfeitos</b>
                        <small>Escala inteira, sem distorcer os pixels.</small>
                      </span>
                      <span className="cx-switch">
                        <i />
                      </span>
                    </button>
                    {props.telaCheia.disponivel && (
                      <button
                        type="button"
                        className="cgp-setting-row cgp-setting-button"
                        onClick={props.telaCheia.alternar}
                      >
                        <span>
                          <b>
                            {props.telaCheia.ativa ? 'Sair da tela cheia' : 'Ativar tela cheia'}
                          </b>
                          <small>A partida continua no modo console.</small>
                        </span>
                        <Maximize size={20} />
                      </button>
                    )}
                    <div className="cgp-setting-row">
                      <div>
                        <b>Volume do jogo</b>
                        <small>{Math.round(props.volume * 100)}%</small>
                      </div>
                      <input
                        type="range"
                        aria-label="Volume do jogo"
                        min={0}
                        max={100}
                        step={5}
                        value={Math.round(props.volume * 100)}
                        onChange={(e) => props.aoTrocarVolume(Number(e.target.value) / 100)}
                        disabled={props.mudo}
                      />
                    </div>
                    <button
                      type="button"
                      className="cgp-setting-row cgp-setting-button"
                      onClick={() =>
                        props.audioBloqueado ? props.ativarAudio() : props.aoTrocarMudo(!props.mudo)
                      }
                    >
                      <span>
                        <b>
                          {props.audioBloqueado
                            ? 'Ativar som'
                            : props.mudo
                              ? 'Reativar som'
                              : 'Silenciar jogo'}
                        </b>
                        <small>
                          {props.audioBloqueado
                            ? 'Um clique libera o áudio no navegador.'
                            : 'O volume escolhido será preservado.'}
                        </small>
                      </span>
                      {props.mudo ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </button>
                  </section>
                )}
                {aba === 'nuvem' && (
                  <section className="cgp-progress-panel">
                    <span className="cx-overline">SEU PROGRESSO VAI COM VOCÊ</span>
                    <h3>Além desta partida.</h3>
                    <p className="cgp-section-description">
                      O save do próprio jogo é diferente dos estados salvos. Aqui você acompanha ou
                      vincula esse progresso à sua conta.
                    </p>
                    {props.modo.progresso}
                    <p className="cgp-save-caption">
                      Para enviar ou baixar um save state, abra Estados salvos e escolha o slot.
                    </p>
                  </section>
                )}
              </>
            )}
            {(recado || props.ocupado) && (
              <p className="cgp-feedback" role="status">
                {props.ocupado ? 'Concluindo operação…' : recado}
              </p>
            )}
          </div>
        </div>
        <footer className="cgp-menu-footer">
          <span>
            <kbd>✚</kbd>Navegar <kbd>A / ✕</kbd>Selecionar
          </span>
          <span>
            <kbd>L1</kbd> + <kbd>R1</kbd> ou <kbd>Esc</kbd>Voltar ao jogo
          </span>
        </footer>
        {confirmacao && (
          <div
            className="cgp-confirm"
            role="alertdialog"
            aria-modal="true"
            aria-label={confirmacao.titulo}
          >
            <div>
              <span className="cx-overline">ANTES DE CONTINUAR</span>
              <h3>{confirmacao.titulo}</h3>
              <p>{confirmacao.detalhe}</p>
              <div>
                <button
                  type="button"
                  data-console-cancel=""
                  data-console-sound="voltar"
                  onClick={() => setConfirmacao(null)}
                  disabled={props.ocupado}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="cgp-confirm-action"
                  disabled={props.ocupado}
                  onClick={() => {
                    void confirmacao.executar();
                  }}
                >
                  {props.ocupado ? 'Aguarde…' : confirmacao.rotulo}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function SlotDoConsole({
  slot,
  salvar,
  carregar,
  ocupado,
  nuvem,
}: {
  slot: SaveSlotView;
  salvar: () => void;
  carregar: () => void;
  ocupado: boolean;
  nuvem: SincronizacaoDeSaveStates;
}) {
  const [imagem, setImagem] = useState<string | null>(null);
  useEffect(() => {
    if (!slot.thumbnail) {
      setImagem(null);
      return;
    }
    const url = thumbnailUrl(slot.thumbnail);
    setImagem(url);
    return () => revokeThumbnailUrl(url);
  }, [slot.thumbnail]);
  const estado = nuvem.estadoPorSlot.get(slot.slot);
  return (
    <article className="cgp-save-slot">
      <div className="cgp-slot-preview">
        {imagem ? (
          <img src={imagem} alt={`Momento salvo no slot ${slot.slot + 1}`} />
        ) : (
          <div>
            <Save size={26} strokeWidth={1} />
            <span>{slot.metadata ? 'Sem miniatura' : 'Um novo momento'}</span>
          </div>
        )}
        <span className="cgp-slot-number">{String(slot.slot + 1).padStart(2, '0')}</span>
      </div>
      <div className="cgp-slot-info">
        <h4>Slot {slot.slot + 1}</h4>
        <p>
          {slot.metadata
            ? new Date(slot.metadata.updatedAt).toLocaleString('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'Disponível para salvar'}
        </p>
      </div>
      {slot.incompatibleReason && <p className="cgp-warning">{slot.incompatibleReason}</p>}
      <div className="cgp-slot-actions">
        <button
          type="button"
          disabled={ocupado}
          onClick={salvar}
          aria-label={`Salvar no slot ${slot.slot + 1}`}
        >
          Salvar
        </button>
        <button
          type="button"
          disabled={ocupado || !slot.metadata || slot.incompatibleReason !== null}
          onClick={carregar}
          aria-label={`Carregar slot ${slot.slot + 1}`}
        >
          Carregar
        </button>
      </div>
      <div className="cgp-slot-cloud">
        <span>
          {estado === 'sincronizado'
            ? 'Na nuvem'
            : estado === 'apenas-nuvem'
              ? 'Só na nuvem'
              : estado === 'divergente'
                ? 'Versões diferentes'
                : slot.metadata
                  ? 'Neste aparelho'
                  : 'Slot vazio'}
        </span>
        {estado && estado !== 'sincronizado' && (
          <button
            type="button"
            disabled={ocupado}
            onClick={() => nuvem.aoClicarSincronizar(slot.slot)}
            aria-label={`Sincronizar slot ${slot.slot + 1}`}
          >
            <Cloud size={13} />
            {estado === 'apenas-nuvem' ? 'Baixar' : estado === 'divergente' ? 'Comparar' : 'Enviar'}
          </button>
        )}
      </div>
    </article>
  );
}
