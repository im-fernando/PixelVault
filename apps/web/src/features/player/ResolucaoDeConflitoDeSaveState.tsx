import { useEffect, useState } from 'react';
import { BotaoPilula } from '../../ui/Botao.js';
import {
  createSaveStorage,
  revokeThumbnailUrl,
  stateKey,
  thumbnailUrl,
  type SaveMetadata,
  type SaveSlot,
  type SaveStorage,
} from './storage/index.js';
import {
  baixarBytesDoSaveState,
  base64ParaBlob,
  miniaturaParaEnvio,
  bytesParaBase64,
  useEnviarSaveStateParaNuvem,
} from './state-nuvem.js';

/** O lado local de um conflito: o que já está no aparelho para aquele slot. */
export interface LadoLocalDoConflito {
  readonly metadata: SaveMetadata;
  readonly thumbnail: Blob | null;
  readonly data: Uint8Array;
}

/**
 * O lado da nuvem — o mesmo formato que sai tanto do 409 de
 * `gravar-save-state.ts` (#105) quanto de um item da listagem (#106):
 * revisão, tamanho, data do servidor, e miniatura em base64 quando a API
 * conseguiu lê-la (o 409 documenta que isso é melhor esforço — pode faltar).
 */
export interface LadoNuvemDoConflito {
  readonly revision: number;
  readonly sizeBytes: number;
  readonly updatedAt: string;
  readonly thumbnailBase64?: string | undefined;
}

type Escolha = 'nuvem' | 'local';

interface Props {
  readonly romId: string;
  readonly romIdLocal?: string;
  readonly slot: SaveSlot;
  readonly local: LadoLocalDoConflito;
  readonly nuvem: LadoNuvemDoConflito;
  /** Injetável para teste, do mesmo jeito que `AdocaoDeSram` aceita. */
  readonly storage?: SaveStorage | undefined;
  /** Chamado depois que a escolha foi aplicada dos dois lados. */
  readonly aoResolver?: ((escolha: Escolha) => void) | undefined;
}

/**
 * A tela de conflito de save state, lado a lado — issue #107.
 *
 * Constrói a PEÇA reutilizável, não a fiação: quem monta este componente
 * (a #108) decide quando um slot está em conflito e de onde vêm `local` e
 * `nuvem` (do 409 de um envio recusado, ou da listagem da #106 comparada
 * contra o storage local). Este componente não sabe nada disso — só mostra
 * os dois lados e aplica a escolha que a pessoa fizer.
 *
 * ## Por que save state pede uma tela própria, e a SRAM não ganhou uma igual
 *
 * A SRAM resolve conflito sincronizando sozinha, com "a nuvem vence" (#91) —
 * ela grava sozinha o tempo todo, e esperar confirmação a cada gravação
 * seria péssima experiência. Save state é o oposto: nasce de um clique
 * deliberado num slot específico, guarda o progresso de um momento que a
 * pessoa quis preservar (antes de um chefe, por exemplo), e sobrescrever o
 * lado errado é sempre visível e sempre doloroso. Esta tela existe para dar
 * à pessoa a escolha que a SRAM automatiza.
 *
 * ## Duas decisões que a issue pede para documentar
 *
 * 1. **Leque de opções: só "manter a nuvem" e "substituir pela local".** Não
 *    existe "manter os dois, salvando a local num slot livre" — a API não
 *    tem essa operação como conceito (seria só um upload comum para outro
 *    slot), e decidir sozinho qual dos três slots restantes usar, ou pedir
 *    que a pessoa escolha no meio de uma tela de conflito, é complexidade
 *    que a issue não pede com clareza. Quem quiser preservar os dois já
 *    pode: salvar num slot livre é a mesma ação de sempre, antes ou depois
 *    de resolver este conflito — não precisa de um terceiro botão aqui.
 * 2. **A SRAM não passa a usar esta tela.** O componente nasceu genérico o
 *    bastante (recebe os dois lados como dados, não busca nada sozinho) para
 *    servir a SRAM no futuro, mas trocar "a nuvem vence" por uma escolha
 *    manual na sincronização automática (#91) é revisar um comportamento já
 *    em produção — decisão de outra issue, com o próprio custo de UX
 *    (confirmação a cada gravação automática) que a #91 rejeitou
 *    explicitamente. Esta issue só constrói a peça; ligá-la em outro lugar é
 *    escopo maior do que "resolver conflito de save state".
 *
 * ## Como cada escolha se aplica
 *
 * "Substituir pela local" envia os bytes e a miniatura locais para a nuvem,
 * com a `revision` do lado da nuvem como base — o mesmo upload que qualquer
 * gravação de save state já faz. "Manter a nuvem" baixa os bytes do slot
 * (`GET .../:romId/:slot`, #106) e grava no storage local, com o
 * `systemId`/`coreVersion` do save local que está sendo substituído — os dois
 * lados são o mesmo jogo, no mesmo aparelho, rodando o mesmo core agora, e
 * essa identidade é o que faz o save carregado depois passar a checagem de
 * compatibilidade (`compatibility.ts`) em vez de vir marcado como
 * incompatível.
 *
 * Uma prévia ausente usa um placeholder; o backup dos bytes não depende
 * da captura de imagem funcionar.
 */
export function ResolucaoDeConflitoDeSaveState({
  romId,
  romIdLocal = romId,
  slot,
  local,
  nuvem,
  storage: storageInjetado,
  aoResolver,
}: Props) {
  const [escolha, setEscolha] = useState<Escolha>('nuvem');
  const [aplicando, setAplicando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const enviar = useEnviarSaveStateParaNuvem(romId, slot);

  const urlLocal = useMiniatura(local.thumbnail);
  const urlNuvem = useMiniaturaBase64(nuvem.thumbnailBase64);

  const confirmar = async (): Promise<void> => {
    setErro(null);
    setAplicando(true);
    try {
      if (escolha === 'local') {
        await enviar.mutateAsync({
          dataBase64: bytesParaBase64(local.data),
          thumbnailBase64: await miniaturaParaEnvio(local.thumbnail),
          revision: nuvem.revision,
          updatedAtLocal: local.metadata.updatedAt,
        });
      } else {
        const bytes = await baixarBytesDoSaveState(romId, slot);
        if (bytes === null) {
          throw new Error('O save state da nuvem não existe mais — outro conflito?');
        }
        const storage = storageInjetado ?? (await createSaveStorage());
        await storage.write({
          key: stateKey(romIdLocal, slot),
          data: bytes,
          systemId: local.metadata.systemId,
          coreVersion: local.metadata.coreVersion,
          updatedAt: Date.parse(nuvem.updatedAt),
          thumbnail:
            nuvem.thumbnailBase64 !== undefined ? base64ParaBlob(nuvem.thumbnailBase64) : null,
        });
      }
      aoResolver?.(escolha);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao aplicar a escolha. Tente de novo.');
    } finally {
      setAplicando(false);
    }
  };

  return (
    <div className="pv-painel space-y-4 p-5">
      <p className="max-w-prose text-[13.5px] leading-relaxed text-label-100">
        Este slot tem progresso diferente aqui e na nuvem. Escolha qual fica — nenhum dos dois lados
        some por conta própria.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <LadoDoConflito rotulo="Este aparelho" url={urlLocal} metadata={local.metadata} />
        <LadoDoConflito
          rotulo="Nuvem"
          url={urlNuvem}
          metadata={{ byteLength: nuvem.sizeBytes, updatedAt: Date.parse(nuvem.updatedAt) }}
        />
      </div>

      <fieldset className="flex flex-col gap-2 text-[13.5px] text-label-100">
        <legend className="sr-only">Qual save state manter</legend>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            className="pv-radio"
            name={`escolha-state-${romId}-${slot}`}
            checked={escolha === 'nuvem'}
            onChange={() => setEscolha('nuvem')}
          />
          Manter o da nuvem
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            className="pv-radio"
            name={`escolha-state-${romId}-${slot}`}
            checked={escolha === 'local'}
            onChange={() => setEscolha('local')}
          />
          Substituir pelo deste aparelho
        </label>
      </fieldset>

      <BotaoPilula pequena onClick={() => void confirmar()} disabled={aplicando}>
        {aplicando ? 'Aplicando…' : 'Confirmar'}
      </BotaoPilula>

      {erro !== null && <p className="text-[12px] text-alert">{erro}</p>}
    </div>
  );
}

function LadoDoConflito({
  rotulo,
  url,
  metadata,
}: {
  readonly rotulo: string;
  readonly url: string | null;
  readonly metadata: { readonly byteLength: number; readonly updatedAt: number };
}) {
  return (
    <div className="pv-painel pv-painel--vidro min-w-0 overflow-hidden">
      <div className="pv-slot-previa">
        {url !== null ? (
          <img src={url} alt="" />
        ) : (
          <div className="flex h-full items-center justify-center">
            <span className="leitura text-ink-700">sem miniatura</span>
          </div>
        )}
      </div>
      <div className="p-3">
        <p className="sobrelinha">{rotulo}</p>
        <p className="leitura mt-1.5 text-label-200">
          {(metadata.byteLength / 1024).toFixed(0)} KB ·{' '}
          {new Date(metadata.updatedAt).toLocaleString('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
          })}
        </p>
      </div>
    </div>
  );
}

/** Object URL da miniatura local, revogado quando ela muda ou o componente sai. */
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

/** Mesma ideia de {@link useMiniatura}, para a miniatura que já chegou em base64 (409/listagem). */
function useMiniaturaBase64(thumbnailBase64: string | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (thumbnailBase64 === undefined) {
      setUrl(null);
      return;
    }
    const criada = thumbnailUrl(base64ParaBlob(thumbnailBase64));
    setUrl(criada);
    return () => revokeThumbnailUrl(criada);
  }, [thumbnailBase64]);

  return url;
}
