import { useEffect, useState } from 'react';
import type { CapaCandidata } from '@pixelvault/contracts';
import { Arte } from '../../ui/Arte.js';
import { BotaoPilula } from '../../ui/Botao.js';
import { Dialogo } from '../../ui/Dialogo.js';
import { useBuscarCapasCandidatas } from './use-buscar-capas-candidatas.js';
import { useIdentificarCapa } from './use-identificar-capa.js';

/** Quanto esperar depois da última tecla antes de perguntar ao servidor. */
const DEBOUNCE_MS = 350;

/**
 * "Identificar capa": o botão de saída para o jogo que a busca automática
 * não achou.
 *
 * A busca automática tenta o título do catálogo contra uma lista curta de
 * sufixos de região (ver `nomes-no-libretro.ts` no servidor) e não acha
 * quando o arquivo do provedor carrega um sufixo fora dessa lista — região
 * **e** idioma juntos, por exemplo. Pedir o nome EXATO pra pessoa digitar
 * não é intuitivo — ninguém sabe de cabeça que o provedor escreve
 * "(Japan, USA) (En,Ja)" — então este diálogo busca enquanto a pessoa
 * digita e mostra os nomes que o provedor tem de verdade, para escolher em
 * vez de adivinhar.
 *
 * A escolha de um item da lista é a confirmação: clicar já chama
 * `POST .../cover` com o nome exato daquele item — sem precisar apertar
 * outro botão. O "Procurar" abaixo do campo é o atalho para quem já sabe o
 * nome exato (ou quando a lista de sugestões não trouxe nada): tenta o
 * texto digitado tal como está, pelo mesmo caminho que a versão anterior
 * deste diálogo usava sozinha.
 *
 * Só aparece em cartucho reconhecido (`gameId` não nulo) sem capa: sem
 * `gameId` não há jogo do catálogo para guardar a capa encontrada, e com
 * capa já não há o que procurar.
 */
export function IdentificarCapa({
  gameId,
  tituloSugerido,
  fechar,
}: {
  readonly gameId: string;
  readonly tituloSugerido: string;
  readonly fechar: () => void;
}) {
  const [termo, setTermo] = useState(tituloSugerido);
  const [termoParaBuscar, setTermoParaBuscar] = useState(tituloSugerido);
  const identificar = useIdentificarCapa();
  const candidatas = useBuscarCapasCandidatas(gameId, termoParaBuscar);

  useEffect(() => {
    const temporizador = window.setTimeout(() => setTermoParaBuscar(termo), DEBOUNCE_MS);
    return () => window.clearTimeout(temporizador);
  }, [termo]);

  const achada = identificar.isSuccess && identificar.data.status === 'encontrada';

  function escolher(candidata: CapaCandidata): void {
    identificar.mutate({ gameId, title: candidata.title });
  }

  return (
    <Dialogo titulo="Identificar capa" sobrelinha="Busca manual" fechar={fechar}>
      <p className="mt-4 text-[14px] leading-relaxed text-ink-500">
        Digite parte do nome do jogo e escolha na lista — os nomes vêm do próprio provedor de capas,
        então clicar num deles já é a resposta certa.
      </p>

      <input
        type="text"
        value={termo}
        onChange={(evento) => {
          setTermo(evento.target.value);
          identificar.reset();
        }}
        data-autofocus=""
        className="pv-campo mt-5 w-full"
        placeholder="Nome do jogo"
        maxLength={200}
      />

      {achada ? (
        <p className="mt-4 text-[13px] text-label-100">Achamos! A capa já está na sua estante.</p>
      ) : (
        <>
          <ListaDeCandidatas
            termo={termo}
            candidatas={candidatas.data}
            carregando={candidatas.isFetching}
            aoEscolher={escolher}
            escolhendo={identificar.isPending}
          />

          {identificar.isSuccess && identificar.data.status === 'nao-encontrada' && (
            <p role="alert" className="mt-3 text-[13px] text-alert">
              Não achamos capa com esse nome exato. Se nenhuma sugestão acima serve, confira a
              grafia — região e idioma entram como o provedor os escreve.
            </p>
          )}
          {identificar.isError && (
            <p role="alert" className="mt-3 text-[13px] text-alert">
              Não deu para procurar agora. Tente de novo.
            </p>
          )}
        </>
      )}

      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <BotaoPilula variante="secundaria" pequena type="button" onClick={fechar}>
          {achada ? 'Fechar' : 'Cancelar'}
        </BotaoPilula>
        {!achada && (
          <BotaoPilula
            pequena
            type="button"
            disabled={identificar.isPending || termo.trim().length === 0}
            onClick={() => identificar.mutate({ gameId, title: termo.trim() })}
            title="Tenta o texto do campo exatamente como está, sem passar pela lista"
          >
            {identificar.isPending ? 'Procurando…' : 'Procurar esse nome exato'}
          </BotaoPilula>
        )}
      </div>
    </Dialogo>
  );
}

/**
 * A lista de sugestões, com os três estados de quem ainda não digitou o
 * bastante, está esperando a rede, ou não achou nada.
 */
function ListaDeCandidatas({
  termo,
  candidatas,
  carregando,
  escolhendo,
  aoEscolher,
}: {
  readonly termo: string;
  readonly candidatas: readonly CapaCandidata[] | undefined;
  readonly carregando: boolean;
  readonly escolhendo: boolean;
  readonly aoEscolher: (candidata: CapaCandidata) => void;
}) {
  if (termo.trim().length < 2) {
    return (
      <p className="mt-4 text-[12.5px] text-ink-700">Digite pelo menos 2 letras para buscar.</p>
    );
  }

  if (carregando) {
    return <p className="mt-4 text-[12.5px] text-ink-700">Procurando…</p>;
  }

  if (candidatas === undefined || candidatas.length === 0) {
    return (
      <p className="mt-4 text-[12.5px] text-ink-700">
        Nenhuma sugestão para esse trecho. Pode ser que o provedor não tenha capa desse jogo.
      </p>
    );
  }

  return (
    <ul className="mt-4 grid max-h-64 gap-1 overflow-y-auto">
      {candidatas.map((candidata) => (
        <li key={candidata.title}>
          <button
            type="button"
            disabled={escolhendo}
            onClick={() => aoEscolher(candidata)}
            className="flex w-full items-center gap-3 rounded-lg p-2 text-left transition-colors hover:bg-white/5 disabled:opacity-50"
          >
            <span className="h-14 w-11 shrink-0">
              <Arte titulo={candidata.title} sistema={null} capaUrl={candidata.coverUrl} />
            </span>
            <span className="truncate text-[13px] text-label-100">{candidata.title}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
