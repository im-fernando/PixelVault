import { Cloud, Trash2 } from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { BotaoIcone, BotaoPilula } from '../../ui/Botao.js';
import { LinhaDeSecao } from '../../ui/Texto.js';
import type { EstadoDoSlotNaNuvem } from './sincronizacao-de-save-states.js';
import {
  revokeThumbnailUrl,
  thumbnailUrl,
  type SaveSlot,
  type SaveSlotView,
} from './storage/index.js';

/**
 * Os quatro slots de save state.
 *
 * Cada slot é um dos quatro botões do Super Famicom — A, B, X, Y — e usa a cor
 * daquele botão. Não é decoração: é o mesmo console que a pessoa está
 * emulando, e a cor deixa de ser enfeite para virar o nome do lugar. Ver
 * docs/design.md e ADR 0016.
 *
 * A miniatura vem do próprio quadro no instante do save, e é o que transforma
 * "Slot 1, Slot 2, Slot 3" numa galeria em que a pessoa reconhece onde parou.
 *
 * A cor entra pela variável `--slot` do `.pv-slot`: é ela que pinta a letra
 * e o brilho da borda ao passar o mouse, e é o único lugar da tela em que as
 * quatro cores aparecem.
 */

const BOTOES: Readonly<Record<SaveSlot, { readonly letra: string; readonly cor: string }>> = {
  0: { letra: 'A', cor: 'var(--color-slot-0)' },
  1: { letra: 'B', cor: 'var(--color-slot-1)' },
  2: { letra: 'X', cor: 'var(--color-slot-2)' },
  3: { letra: 'Y', cor: 'var(--color-slot-3)' },
};

interface Props {
  readonly slots: readonly SaveSlotView[];
  readonly volatil: boolean;
  readonly aoSalvar: (slot: SaveSlot) => void;
  readonly aoCarregar: (slot: SaveSlot) => void;
  readonly aoApagar: (slot: SaveSlot) => void;
  /**
   * O estado de cada slot na nuvem — issue #108. Sem isto (ou sem entrada
   * para um slot) a galeria se comporta exatamente como antes: sem badge,
   * sem botão de sincronizar. `PlayPage` e `LocalPlayPage` (homebrew e
   * ensaio local, sem conta) nunca passam isto.
   */
  readonly estadoNaNuvem?: ReadonlyMap<SaveSlot, EstadoDoSlotNaNuvem> | undefined;
  /** Slot com upload/download em voo — desabilita o botão daquele slot só. */
  readonly sincronizandoSlot?: SaveSlot | null | undefined;
  readonly aoSincronizar?: ((slot: SaveSlot) => void) | undefined;
}

export function GaleriaDeSlots({
  slots,
  volatil,
  aoSalvar,
  aoCarregar,
  aoApagar,
  estadoNaNuvem,
  sincronizandoSlot,
  aoSincronizar,
}: Props) {
  const gravados = slots.filter((s) => s.metadata !== null).length;

  return (
    <section aria-labelledby="estados-salvos">
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
        <LinhaDeSecao id="estados-salvos" nome="Estados salvos" contagem={`${gravados}/4`} />
        {volatil && (
          <span className="text-[11px] text-alert">
            este navegador não guarda nada: o progresso some ao fechar a aba
          </span>
        )}
      </div>

      <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {slots.map((vista) => (
          <li key={vista.slot}>
            <Slot
              vista={vista}
              aoSalvar={aoSalvar}
              aoCarregar={aoCarregar}
              aoApagar={aoApagar}
              estadoNaNuvem={estadoNaNuvem?.get(vista.slot)}
              sincronizando={sincronizandoSlot === vista.slot}
              aoSincronizar={aoSincronizar}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

const ROTULO_DO_ESTADO: Record<EstadoDoSlotNaNuvem, string> = {
  'apenas-local': 'aguardando envio',
  'apenas-nuvem': 'só na nuvem',
  sincronizado: 'sincronizado',
  divergente: 'divergente',
};

function Slot({
  vista,
  aoSalvar,
  aoCarregar,
  aoApagar,
  estadoNaNuvem,
  sincronizando,
  aoSincronizar,
}: {
  readonly vista: SaveSlotView;
  readonly aoSalvar: (slot: SaveSlot) => void;
  readonly aoCarregar: (slot: SaveSlot) => void;
  readonly aoApagar: (slot: SaveSlot) => void;
  readonly estadoNaNuvem: EstadoDoSlotNaNuvem | undefined;
  readonly sincronizando: boolean;
  readonly aoSincronizar: ((slot: SaveSlot) => void) | undefined;
}) {
  const botao = BOTOES[vista.slot];
  const gravado = vista.metadata;
  const incompativel = vista.incompatibleReason !== null;
  const carregavel = gravado !== null && !incompativel;
  const url = useMiniatura(vista.thumbnail);

  return (
    <article className="pv-slot" style={{ '--slot': botao.cor } as CSSProperties}>
      <div className="pv-slot-previa">
        {url !== null ? (
          <img src={url} alt="" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="leitura text-ink-700">
              {gravado !== null ? 'sem miniatura' : 'vazio'}
            </span>
          </div>
        )}

        {/* A letra do botão. É o nome do slot, e a cor é a mesma do console. */}
        <span className="pv-slot-letra" aria-hidden="true">
          {botao.letra}
        </span>

        {incompativel && (
          <span className="absolute inset-x-0 bottom-0 bg-ink-950/90 px-2.5 py-1 text-[10px] leading-tight text-alert">
            incompatível
          </span>
        )}
      </div>

      <div className="p-3">
        <p className="leitura truncate text-ink-500">
          {gravado !== null ? formatarInstante(gravado.updatedAt) : 'gravar aqui'}
        </p>

        {/*
          `flex-wrap`: no ponto em que a grade vira quatro colunas o slot fica
          estreito demais para a pílula e a lixeira lado a lado; a lixeira
          desce uma linha em vez de sair cortada pela moldura.
        */}
        <div className="mt-2.5 flex flex-wrap items-center gap-1">
          <BotaoPilula
            variante="secundaria"
            pequena
            className="flex-1"
            disabled={incompativel || sincronizando}
            title={vista.incompatibleReason ?? undefined}
            aria-label={
              carregavel
                ? `Carregar o estado do slot ${botao.letra}`
                : `Gravar no slot ${botao.letra}`
            }
            onClick={() => (carregavel ? aoCarregar(vista.slot) : aoSalvar(vista.slot))}
          >
            {carregavel ? 'Carregar' : 'Gravar'}
          </BotaoPilula>
          {gravado !== null && (
            <BotaoPilula
              pequena
              variante="secundaria"
              disabled={sincronizando || incompativel}
              aria-label={`Gravar no slot ${botao.letra}`}
              onClick={() => aoSalvar(vista.slot)}
            >
              Gravar
            </BotaoPilula>
          )}
          {gravado !== null && (
            <BotaoIcone
              rotulo={`Apagar o estado do slot ${botao.letra}`}
              className="hover:text-alert"
              disabled={sincronizando}
              onClick={() => aoApagar(vista.slot)}
            >
              <Trash2 size={15} />
            </BotaoIcone>
          )}
        </div>

        {estadoNaNuvem !== undefined && (
          <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span
              role="status"
              className={`leitura inline-flex items-center gap-1.5 ${
                estadoNaNuvem === 'divergente' ? 'text-alert' : 'text-ink-700'
              }`}
            >
              <Cloud size={11} className="shrink-0" />
              {sincronizando ? 'Sincronizando…' : ROTULO_DO_ESTADO[estadoNaNuvem]}
            </span>
            {estadoNaNuvem !== 'sincronizado' && aoSincronizar !== undefined && (
              <button
                type="button"
                onClick={() => aoSincronizar(vista.slot)}
                disabled={sincronizando}
                className="leitura text-label-200 underline-offset-2 hover:underline disabled:opacity-50"
              >
                {sincronizando
                  ? '…'
                  : estadoNaNuvem === 'apenas-nuvem'
                    ? 'baixar'
                    : estadoNaNuvem === 'divergente'
                      ? 'resolver'
                      : 'enviar'}
              </button>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Object URL da miniatura, revogado sempre que ela muda ou o slot sai da tela. */
function useMiniatura(thumbnail: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (thumbnail === null) {
      setUrl(null);
      return;
    }
    const criada = thumbnailUrl(thumbnail);
    setUrl(criada);
    return () => revokeThumbnailUrl(criada);
  }, [thumbnail]);

  return url;
}

function formatarInstante(iso: string | number | Date): string {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}
