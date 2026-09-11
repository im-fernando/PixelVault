import { Cloud } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BotaoPilula } from '../../ui/Botao.js';
import { useSramLocal, type SaveStorage } from './storage/index.js';
import { gravarRevisaoSincronizada } from './storage/sram-sync-revision.js';
import { bytesParaBase64, useEnviarSramParaNuvem, useSramNaNuvem } from './sram-nuvem.js';

interface Props {
  /** O SHA-256 da ROM — a mesma chave do save local (`sramKey`) e da conta na nuvem. */
  readonly romId: string;
  /** Injetável para teste, do mesmo jeito que `EmulatorPlayer` aceita `registry`. */
  readonly storage?: SaveStorage | undefined;
}

type Escolha = 'nuvem' | 'local';

/**
 * A oferta de subir a SRAM local para a nuvem — ADR 0020, issue #92.
 *
 * Três regras da ADR, na prática:
 *
 * 1. **Nunca automática.** Sem SRAM local, este componente não renderiza
 *    nada — não há o que oferecer. Com SRAM local e nuvem vazia, é um botão;
 *    com nuvem ocupada, é uma escolha que exige clique em "confirmar", e
 *    "manter o da nuvem" (que não envia nada) vem pré-marcado.
 * 2. **Cópia, nunca mudança de lugar.** O envio só lê o save local
 *    (`SaveStorage.read`); nada aqui apaga ou move o arquivo do navegador.
 * 3. **Sem "mais recente vence".** Quando a nuvem já tem algo, a tela mostra
 *    data e tamanho dos dois lados e espera a pessoa decidir — nunca compara
 *    os `updatedAt` para escolher sozinha.
 *
 * O "vínculo" que a sincronização automática da #91 vai usar depois de uma
 * adoção bem-sucedida não é uma flag nova: é a própria resposta de
 * `useSramNaNuvem` virando `status: 'encontrado'` — ver o comentário de
 * `sram-nuvem.ts`.
 */
export function AdocaoDeSram({ romId, storage }: Props) {
  const local = useSramLocal(romId, storage);
  const nuvem = useSramNaNuvem(romId);
  const enviar = useEnviarSramParaNuvem(romId);
  const [escolha, setEscolha] = useState<Escolha>('nuvem');
  const [concluido, setConcluido] = useState(false);
  const [mantidoNaNuvem, setMantidoNaNuvem] = useState(false);

  // Troca de ROM (o `key={romId}` da rota já força isso, mas um componente
  // que sobrevivesse à troca não deveria herdar o "enviado" de outro jogo).
  useEffect(() => {
    setConcluido(false);
    setMantidoNaNuvem(false);
    setEscolha('nuvem');
  }, [romId]);

  if (local.pending || nuvem.isPending) return null;
  if (local.save === null) return null;
  // Erro ao consultar a nuvem não pode impedir jogar — a oferta some, e a
  // partida continua normal pelo save local, como sempre funcionou.
  if (nuvem.data === undefined) return null;

  const enviarAgora = (revisaoBase: number) => {
    const dataBase64 = bytesParaBase64(local.save!.data);
    enviar.mutate({ dataBase64, revision: revisaoBase }, { onSuccess: () => setConcluido(true) });
  };

  if (concluido) {
    return (
      <p role="status" className="pv-chip">
        <Cloud size={13} className="shrink-0" />
        Save enviado para a nuvem.
      </p>
    );
  }

  if (nuvem.data.status === 'sem-save') {
    return (
      <div className="pv-painel flex flex-wrap items-center gap-4 p-5">
        <p className="text-[13.5px] leading-relaxed text-label-100">
          Este aparelho tem progresso deste jogo que a nuvem ainda não tem.
        </p>
        <BotaoPilula
          pequena
          className="ml-auto"
          onClick={() => enviarAgora(0)}
          disabled={enviar.isPending}
        >
          <Cloud size={15} />
          {enviar.isPending ? 'Enviando…' : 'Enviar para a nuvem'}
        </BotaoPilula>
        {enviar.isError && (
          <p className="w-full text-[12px] text-alert">Falha ao enviar. Tente de novo.</p>
        )}
      </div>
    );
  }

  const dadosDaNuvem = nuvem.data;

  return (
    <div className="pv-painel space-y-4 p-5">
      <p className="max-w-prose text-[13.5px] leading-relaxed text-label-100">
        A nuvem já tem um save deste jogo. Escolha qual fica lá — o save local não é apagado de
        nenhum jeito.
      </p>

      <dl className="grid grid-cols-2 gap-3">
        <LadoDoSave
          rotulo="Este aparelho"
          tamanho={local.save.metadata.byteLength}
          instante={local.save.metadata.updatedAt}
        />
        <LadoDoSave
          rotulo="Nuvem"
          tamanho={dadosDaNuvem.sizeBytes}
          instante={dadosDaNuvem.updatedAt}
        />
      </dl>

      <fieldset className="flex flex-col gap-2 text-[13.5px] text-label-100">
        <legend className="sr-only">Qual save manter na nuvem</legend>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            className="pv-radio"
            name={`escolha-sram-${romId}`}
            checked={escolha === 'nuvem'}
            onChange={() => {
              setEscolha('nuvem');
              setMantidoNaNuvem(false);
            }}
          />
          Manter o da nuvem
        </label>
        <label className="flex items-center gap-3">
          <input
            type="radio"
            className="pv-radio"
            name={`escolha-sram-${romId}`}
            checked={escolha === 'local'}
            onChange={() => {
              setEscolha('local');
              setMantidoNaNuvem(false);
            }}
          />
          Substituir pelo save deste aparelho
        </label>
      </fieldset>

      <BotaoPilula
        pequena
        onClick={() => {
          setMantidoNaNuvem(false);
          if (escolha === 'nuvem') {
            // Confirmar "manter o da nuvem" não manda nada — é a própria
            // regra 4 do ADR 0020 (nunca sobrescrever sem escolha explícita)
            // vista do lado que não muda nada. O painel continua à mostra:
            // a pessoa pode mudar de ideia sem recarregar a tela.
            //
            // Mas a escolha em si É o vínculo (#91): a pessoa acabou de dizer
            // "esta é a minha SRAM de referência para este jogo", então este
            // aparelho passa a reconciliar essa revisão em silêncio dali em
            // diante, sem perguntar de novo a cada boot. `refetch` (em vez de
            // só gravar o ponteiro local) é o que avisa
            // `useSincronizacaoDeSram` AGORA, na mesma sessão — sem ele, o
            // vínculo só apareceria no próximo boot, quando a consulta
            // refizesse sozinha.
            gravarRevisaoSincronizada(romId, dadosDaNuvem.revision);
            void nuvem.refetch();
            setMantidoNaNuvem(true);
            return;
          }
          enviarAgora(dadosDaNuvem.revision);
        }}
        disabled={enviar.isPending}
      >
        {enviar.isPending ? 'Enviando…' : 'Confirmar'}
      </BotaoPilula>

      {mantidoNaNuvem && (
        <p role="status" className="pv-chip">
          <Cloud size={13} className="shrink-0" />
          Nada enviado — o save da nuvem foi mantido.
        </p>
      )}
      {enviar.isError && <p className="text-[12px] text-alert">Falha ao enviar. Tente de novo.</p>}
    </div>
  );
}

function LadoDoSave({
  rotulo,
  tamanho,
  instante,
}: {
  readonly rotulo: string;
  readonly tamanho: number;
  readonly instante: number | string;
}) {
  return (
    <div className="pv-painel pv-painel--vidro min-w-0 p-4">
      <dt className="sobrelinha">{rotulo}</dt>
      <dd className="leitura mt-2 text-label-200">
        {(tamanho / 1024).toFixed(1)} KB ·{' '}
        {new Date(instante).toLocaleString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit',
        })}
      </dd>
    </div>
  );
}
