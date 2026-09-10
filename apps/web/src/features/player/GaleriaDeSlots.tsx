import { useEffect, useState } from 'react';
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
  return (
    <section>
      <div className="mb-2 flex items-baseline gap-3 border-b border-ink-850 pb-1.5">
        <h2 className="titulo-estampado text-xs text-label-100">Estados salvos</h2>
        <span className="leitura text-ink-700">
          {slots.filter((s) => s.metadata !== null).length}/4
        </span>
        {volatil && (
          <span className="ml-auto text-[0.7rem] text-alert">
            este navegador não guarda nada: o progresso some ao fechar a aba
          </span>
        )}
      </div>

      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
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
  'apenas-local': 'não sincronizado',
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
  const url = useMiniatura(vista.thumbnail);

  return (
    <div className="group/slot relative">
      <button
        type="button"
        onClick={() =>
          gravado !== null && !incompativel ? aoCarregar(vista.slot) : aoSalvar(vista.slot)
        }
        disabled={incompativel}
        title={vista.incompatibleReason ?? undefined}
        className="block w-full text-left outline-none disabled:cursor-not-allowed"
      >
        <div
          className="relative aspect-[4/3] overflow-hidden border-t-2 bg-ink-900 transition group-hover/slot:bg-ink-850 group-focus-visible/slot:ring-1"
          style={{ borderTopColor: botao.cor }}
        >
          {url !== null ? (
            <img src={url} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full items-center justify-center">
              <span className="leitura text-ink-700">
                {gravado !== null ? 'sem miniatura' : 'vazio'}
              </span>
            </div>
          )}

          {/* A letra do botão. É o nome do slot, e a cor é a mesma do console. */}
          <span
            className="titulo-estampado absolute top-1 left-1.5 text-sm leading-none"
            style={{ color: botao.cor }}
          >
            {botao.letra}
          </span>

          {incompativel && (
            <span className="absolute inset-x-0 bottom-0 bg-ink-950/90 px-1.5 py-1 text-[0.65rem] leading-tight text-alert">
              incompatível
            </span>
          )}
        </div>

        <p className="leitura mt-1 truncate text-ink-700">
          {gravado !== null ? formatarInstante(gravado.updatedAt) : 'gravar aqui'}
        </p>
      </button>

      {gravado !== null && (
        <button
          type="button"
          onClick={() => aoApagar(vista.slot)}
          className="leitura absolute top-1 right-1 bg-ink-950/85 px-1.5 py-0.5 text-ink-500 opacity-0 transition-opacity group-hover/slot:opacity-100 focus-visible:opacity-100"
          aria-label={`Apagar o estado do slot ${botao.letra}`}
        >
          apagar
        </button>
      )}

      {estadoNaNuvem !== undefined && (
        <div className="mt-1 flex items-center justify-between gap-1">
          <span
            className={`leitura ${estadoNaNuvem === 'divergente' ? 'text-alert' : 'text-ink-700'}`}
          >
            {ROTULO_DO_ESTADO[estadoNaNuvem]}
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
