import { FolderUp, Upload } from 'lucide-react';
import { Fragment, useId, useRef, useState, type DragEvent } from 'react';
import { TAMANHO_MAXIMO_DE_ROM_EM_BYTES } from '@pixelvault/contracts';
import { Arte } from '../../ui/Arte.js';
import { BotaoPilula, classesDaPilula } from '../../ui/Botao.js';
import { Aviso, Painel } from '../../ui/Painel.js';
import { Sobrelinha } from '../../ui/Texto.js';
import { EXTENSOES_ACEITAS } from './arquivo-de-rom.js';
import { arquivosDoDrop } from './arquivos-do-drop.js';
import { Cartucho } from './Cartucho.js';
import type { EstadoDoEnvio } from './envio-de-rom.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { emBytesLegiveis } from './tamanho.js';
import { useEnvioDeRom, type ItemRecusadoDoLote, type RomDaSessao } from './use-envio-de-rom.js';

/**
 * A mesa de recepção do acervo: é aqui que a ROM da pessoa entra.
 *
 * A tela é organizada em torno do que a ADR 0014 obriga a mostrar — que
 * existe um passo de verificação entre "enviei" e "está na minha biblioteca".
 * Por isso o miolo não é uma barra de progresso e sim um **protocolo de
 * entrada**: três passos, na ordem em que acontecem, cada um dizendo o que
 * está sendo feito. Terminar não apaga os passos; eles ficam como o carimbo
 * do que foi feito, que é o que um arquivo guardaria.
 *
 * Zona de entrada à esquerda, protocolo à direita: o gesto e a consequência
 * lado a lado, para a pessoa não precisar rolar a tela para ver o que está
 * acontecendo com o arquivo que acabou de soltar. No celular as duas colunas
 * empilham, na mesma ordem.
 */
export function EnviarRomPage() {
  const envio = useEnvioDeRom();

  return (
    <>
      {/*
        A tarefa é estreita e a prateleira não: o miolo do envio fica numa
        coluna, e a fileira do fim sai dela para sangrar até a borda da tela,
        como toda prateleira do produto.
      */}
      <div className="mx-auto max-w-[1080px] pt-6">
        <header>
          <Sobrelinha>mesa de recepção · sua biblioteca</Sobrelinha>
          <h1 className="titulo-cena mt-3 text-[clamp(34px,4vw,60px)] text-label-100">
            Enviar ROM
          </h1>
          <p className="mt-4 max-w-prose text-[14px] leading-relaxed text-ink-500">
            O acervo é seu: a ROM que você enviar fica privada da sua conta, e ninguém mais a baixa.
            Nós guardamos o arquivo e o catálogo cuida do resto — capa, nome, ano — quando reconhece
            o jogo. Dá para soltar várias de uma vez, ou uma pasta inteira: o que não for ROM fica
            de fora sozinho, sem precisar escolher um arquivo por vez.
          </p>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <ZonaDeEntrada aoEscolher={envio.enviar} />
          <Protocolo
            estado={envio.estado}
            restantesNaFila={envio.restantesNaFila}
            aoLimpar={envio.limpar}
          />
        </div>
      </div>

      {envio.nestaSessao.length > 0 && <NestaSessao itens={envio.nestaSessao} />}
      {envio.falhas.length > 0 && <Falhas itens={envio.falhas} />}
    </>
  );
}

/**
 * Arrastar ou escolher — um arquivo, vários, ou uma pasta inteira — e nada
 * além disso.
 *
 * Não há campo de sistema, de título nem de hash: o que a pessoa sabe é qual
 * arquivo é dela, e todo o resto — de que console é, se o conteúdo confere,
 * qual o hash — sai do próprio arquivo, aqui ou no servidor. Pedir à pessoa o
 * que a máquina consegue descobrir é transformar um envio em formulário.
 *
 * Sempre aceita mais — nunca desabilita por causa de um envio em andamento.
 * Soltar um segundo lote enquanto o primeiro ainda sobe entra na fila do
 * `use-envio-de-rom.ts`; esperar de propósito só para poder arrastar de novo
 * seria a interface inventando uma regra que a fila não tem.
 *
 * A pílula "Escolher arquivos" é só desenho dentro do `label`: quem abre o
 * seletor é o `input[type=file]` escondido, e o `label` inteiro é o alvo do
 * clique. Um botão de verdade ali seria elemento interativo dentro de outro.
 * O atalho de pasta é um segundo `input`, à parte, porque `webkitdirectory`
 * e escolha múltipla de arquivos soltos são exclusivos entre si no diálogo
 * do sistema — não dá para os dois caberem no mesmo seletor.
 */
function ZonaDeEntrada({
  aoEscolher,
}: {
  readonly aoEscolher: (arquivos: readonly File[]) => void;
}) {
  const id = useId();
  const idDaPasta = useId();
  const [porCima, setPorCima] = useState(false);
  const inputDaPasta = useRef<HTMLInputElement>(null);

  async function aoSoltar(evento: DragEvent<HTMLLabelElement>): Promise<void> {
    evento.preventDefault();
    setPorCima(false);
    aoEscolher(await arquivosDoDrop(evento.dataTransfer));
  }

  return (
    <label
      htmlFor={id}
      onDragOver={(evento) => {
        evento.preventDefault();
        setPorCima(true);
      }}
      onDragLeave={() => {
        setPorCima(false);
      }}
      onDrop={(evento) => void aoSoltar(evento)}
      className={`pv-zona justify-center ${porCima ? 'pv-zona--por-cima' : ''}`}
    >
      <span className="pv-zona-icone" aria-hidden="true">
        <Upload size={26} strokeWidth={1.5} />
      </span>
      <span className="titulo-cena mt-2 text-[22px] text-label-100">
        Solte arquivos ou uma pasta aqui
      </span>
      <span className="max-w-sm text-[13px] leading-relaxed text-ink-500">
        A ROM tem que estar descompactada — o arquivo do cartucho, não o .zip que veio com ele.
      </span>
      <span className="leitura text-ink-700">
        {EXTENSOES_ACEITAS.join(' ')} · até {emBytesLegiveis(TAMANHO_MAXIMO_DE_ROM_EM_BYTES)}
      </span>
      <span className="mt-3 flex items-center gap-2">
        <span className={classesDaPilula({ pequena: true })} aria-hidden="true">
          Escolher arquivos
        </span>
        <button
          type="button"
          className={classesDaPilula({ pequena: true, variante: 'secundaria' })}
          onClick={(evento) => {
            // Impede que o clique chegue ao `label` — ele abriria o seletor
            // de arquivo solto por cima do de pasta que este botão pede.
            evento.preventDefault();
            inputDaPasta.current?.click();
          }}
        >
          <FolderUp size={14} /> Ou uma pasta
        </button>
      </span>
      <input
        id={id}
        type="file"
        multiple
        className="sr-only"
        accept={EXTENSOES_ACEITAS.join(',')}
        onChange={(evento) => {
          aoEscolher(Array.from(evento.target.files ?? []));
          // Sem isto, escolher o MESMO arquivo depois de uma recusa não dispara
          // `change` nenhum, e a tela fica parada sem que ninguém entenda por quê.
          evento.target.value = '';
        }}
      />
      <input
        id={idDaPasta}
        ref={(elemento) => {
          // `webkitdirectory` não é atributo JSX — é propriedade do elemento
          // DOM, e só existe assim: setá-la aqui é o próprio React chamando
          // isto a cada montagem, sem precisar de `useEffect` para uma
          // propriedade que nunca muda depois de montado.
          if (elemento !== null) elemento.webkitdirectory = true;
        }}
        type="file"
        multiple
        tabIndex={-1}
        aria-hidden="true"
        className="sr-only"
        onChange={(evento) => {
          aoEscolher(Array.from(evento.target.files ?? []));
          evento.target.value = '';
        }}
      />
    </label>
  );
}

/** Os três passos do protocolo, na ordem em que acontecem. */
const PASSOS = ['Enviando', 'Verificando', 'Na biblioteca'] as const;

/** Em que passo o fluxo está. `-1` é "nem começou". */
function linhaAtual(estado: EstadoDoEnvio): number {
  switch (estado.fase) {
    case 'ocioso':
      return -1;
    case 'conferindo':
    case 'enviando':
      return 0;
    case 'verificando':
      return 1;
    case 'pronto':
      return 2;
    case 'recusado':
      return -1;
  }
}

function Protocolo({
  estado,
  restantesNaFila,
  aoLimpar,
}: {
  readonly estado: EstadoDoEnvio;
  /** Quantos outros arquivos esperam atrás do que este painel mostra agora. */
  readonly restantesNaFila: number;
  readonly aoLimpar: () => void;
}) {
  if (estado.fase === 'ocioso') return <ProtocoloEmBranco />;

  if (estado.fase === 'recusado') {
    return (
      <Aviso
        titulo={estado.recusa.titulo}
        acao={
          <BotaoPilula pequena variante="secundaria" onClick={aoLimpar}>
            Escolher outro arquivo
          </BotaoPilula>
        }
      >
        <p>{estado.recusa.detalhe}</p>
        <p className="leitura mt-3 break-all text-ink-700">
          {estado.arquivo.nome} · {emBytesLegiveis(estado.arquivo.sizeBytes)}
        </p>
        {restantesNaFila > 0 && <NotaDaFila restantes={restantesNaFila} />}
      </Aviso>
    );
  }

  const atual = linhaAtual(estado);
  // Terminou, os três passos estão cumpridos — inclusive quando o atalho do
  // hash pulou o envio e a verificação de verdade: o destino é o mesmo, e a
  // nota do último passo diz por que foi tão rápido em vez de fingir um envio.
  const cumpridas = estado.fase === 'pronto' ? PASSOS.length : atual;

  return (
    <Painel className="p-6">
      {restantesNaFila > 0 && <NotaDaFila restantes={restantesNaFila} className="mb-4" />}
      <p className="truncate text-[15px] font-semibold text-label-100">{estado.arquivo.nome}</p>
      <p className="leitura mt-1 text-ink-500">
        {emBytesLegiveis(estado.arquivo.sizeBytes)}
        {estado.arquivo.systemId !== null && ` · ${estado.arquivo.systemId.toUpperCase()}`}
      </p>

      <ol className="mt-7">
        {PASSOS.map((nome, indice) => (
          <Passo
            key={nome}
            numero={indice + 1}
            nome={nome}
            situacao={indice < cumpridas ? 'feita' : indice === atual ? 'agora' : 'adiante'}
          >
            {notaDaLinha(estado, indice)}
          </Passo>
        ))}
      </ol>

      {estado.fase === 'enviando' && (
        <Barra total={estado.arquivo.sizeBytes} feito={estado.bytesEnviados} />
      )}

      {estado.fase === 'pronto' && (
        <div className="mt-2 border-t border-white/10 pt-4">
          <p className="leitura break-all text-ink-700">sha256 {estado.rom.sha256}</p>
          <p className="leitura mt-1 break-all text-ink-700">rom {estado.rom.romId}</p>
          <BotaoPilula pequena variante="secundaria" className="mt-5" onClick={aoLimpar}>
            Enviar outra
          </BotaoPilula>
        </div>
      )}
    </Painel>
  );
}

/**
 * A coluna do protocolo antes de qualquer arquivo: diz os três passos que vão
 * acontecer, para a pessoa saber o que esperar antes de soltar o arquivo — e
 * para a coluna não ficar em branco ao lado da zona de entrada.
 */
function ProtocoloEmBranco() {
  return (
    <div className="pv-vazio">
      <Sobrelinha>Protocolo de entrada</Sobrelinha>
      <p className="max-w-prose text-[13.5px] leading-relaxed text-ink-500">
        Cada arquivo passa por três passos, nesta ordem, e cada um aparece aqui enquanto acontece.
      </p>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-label-200">
        {PASSOS.map((nome, indice) => (
          <Fragment key={nome}>
            {indice > 0 && (
              <span aria-hidden="true" className="text-ink-700">
                →
              </span>
            )}
            <span>{nome}</span>
          </Fragment>
        ))}
      </p>
    </div>
  );
}

/**
 * O que cada passo do protocolo tem a dizer no momento em que está.
 *
 * A frase da verificação é a razão de a tela existir do jeito que existe: ela
 * nomeia o que o servidor está fazendo — lendo os bytes, calculando o hash —
 * porque esse passo pode demorar e ninguém entende uma espera sem nome.
 */
function notaDaLinha(estado: EstadoDoEnvio, indice: number): string | null {
  if (estado.fase === 'pronto' && estado.rom.jaTinha) {
    return indice === 2 ? 'Você já tinha este conteúdo: nada precisou ser enviado.' : null;
  }

  if (indice === 0) {
    if (estado.fase === 'conferindo') return 'Conferindo o arquivo e calculando o hash aqui mesmo.';
    if (estado.fase === 'enviando')
      return 'Os bytes vão direto para o acervo, sem passar pela API.';
    return null;
  }

  if (indice === 1) {
    if (estado.fase === 'verificando') {
      return 'O servidor está lendo o que chegou, calculando o hash dele e conferindo o cabeçalho.';
    }
    return null;
  }

  if (estado.fase !== 'pronto') return null;
  if (estado.rom.gameId !== null) return 'Reconhecida no catálogo — a capa e a ficha vêm de lá.';
  if (estado.rom.deduplicado) return 'Este conteúdo já existia no acervo: nada foi transferido.';
  return 'Guardada. Ela é sua e só sua.';
}

/**
 * Um passo da linha do tempo. O número é honesto — é uma sequência de
 * verdade, com ordem fixa — e por isso aparece, em vez de um ponto.
 */
function Passo({
  numero,
  nome,
  situacao,
  children,
}: {
  readonly numero: number;
  readonly nome: string;
  readonly situacao: 'feita' | 'agora' | 'adiante';
  readonly children: string | null;
}) {
  return (
    <li className="pv-passo" data-situacao={situacao}>
      <span className="pv-passo-numero" aria-hidden="true">
        {String(numero).padStart(2, '0')}
      </span>
      <div className="min-w-0 pt-2.5">
        <p
          className={`text-[14px] font-medium ${
            situacao === 'adiante' ? 'text-ink-500' : 'text-label-100'
          }`}
          aria-current={situacao === 'agora' ? 'step' : undefined}
        >
          {nome}
          {situacao === 'agora' && <span className="sr-only"> (em andamento)</span>}
        </p>
        {children !== null && (
          <p className="mt-1 text-[12.5px] leading-relaxed text-ink-500">{children}</p>
        )}
      </div>
    </li>
  );
}

/**
 * "Mais 3 na fila" — o que faz um lote de várias ROMs não parecer que a tela
 * esqueceu do resto enquanto mostra só a que está passando agora.
 */
function NotaDaFila({
  restantes,
  className = '',
}: {
  readonly restantes: number;
  readonly className?: string;
}) {
  return (
    <p className={`leitura text-ink-700 ${className}`}>
      {restantes === 1 ? 'Mais 1 arquivo na fila' : `Mais ${restantes} arquivos na fila`}
    </p>
  );
}

/**
 * O progresso do PUT, em bytes de verdade.
 *
 * Só existe durante o envio, que é o único passo cuja duração depende do
 * arquivo da pessoa. A verificação não ganha barra: ela não tem porcentagem
 * nenhuma para mostrar, e uma barra fingindo progresso ali seria a interface
 * inventando um número.
 */
function Barra({ total, feito }: { readonly total: number; readonly feito: number }) {
  const porcento = total === 0 ? 0 : Math.min(100, Math.round((feito / total) * 100));

  return (
    <div className="mt-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        aria-label="Envio da ROM"
        className="h-1 w-full rounded bg-white/10"
      >
        <div
          className="h-full rounded bg-luz transition-[width]"
          style={{ width: `${porcento}%` }}
        />
      </div>
      <p className="leitura mt-2 text-ink-700">
        {emBytesLegiveis(feito)} de {emBytesLegiveis(total)} · {porcento}%
      </p>
    </div>
  );
}

/**
 * O que entrou nesta sessão, na prateleira de sempre.
 *
 * É confirmação, não listagem: a biblioteca completa — com favoritar e remover
 * — mora na home, e é ela que sobrevive ao F5. O que esta fileira prova é que
 * o cartucho existe do outro lado, aqui, sem tirar a pessoa da mesa de envio;
 * some no próximo F5 sem deixar saudade.
 */
function NestaSessao({ itens }: { readonly itens: readonly RomDaSessao[] }) {
  const bytes = itens.reduce((soma, item) => soma + item.rom.sizeBytes, 0);

  return (
    <section className="mt-14">
      <EtiquetaDeGaveta
        nome="Entrou agora"
        itens={itens.length}
        bytes={bytes}
        nota="só suas · já estão na sua biblioteca"
      />
      <Prateleira>
        {itens.map((item) =>
          item.arquivo.systemId === null ? (
            <SemSistema
              key={item.rom.romId}
              titulo={item.arquivo.titulo}
              nome={item.arquivo.nome}
              bytes={item.rom.sizeBytes}
            />
          ) : (
            <Cartucho
              key={item.rom.romId}
              titulo={item.rom.titulo ?? item.arquivo.titulo}
              systemId={item.arquivo.systemId}
              capaUrl={item.rom.capaUrl}
              nota={`${item.arquivo.systemId.toUpperCase()} · ${emBytesLegiveis(item.rom.sizeBytes)}`}
              rotulo={`${item.rom.titulo ?? item.arquivo.titulo} — ${item.arquivo.nome}`}
            />
          ),
        )}
      </Prateleira>
    </section>
  );
}

/**
 * O que a verificação recusou num lote de mais de um arquivo.
 *
 * Um arquivo sozinho que é recusado ocupa o `Protocolo` inteiro — a pessoa
 * escolheu aquele, e a recusa é a resposta para exatamente aquela escolha.
 * Num lote, a recusa de um não pode ocupar o mesmo lugar que os outros
 * continuam usando: esta lista é onde ela mora, ao lado do que entrou, para
 * a pessoa saber o que faltou sem precisar adivinhar pela contagem.
 */
function Falhas({ itens }: { readonly itens: readonly ItemRecusadoDoLote[] }) {
  return (
    <section className="mx-auto mt-14 max-w-[1080px]">
      <Sobrelinha>não entraram · {itens.length}</Sobrelinha>
      <ul className="mt-3 grid gap-2">
        {itens.map((item, indice) => (
          // `key` por índice: um arquivo recusado nunca ganha o id que
          // daria uma chave estável, e o nome se repete quando a mesma ROM é
          // arrastada duas vezes por engano — a lista só cresce, nunca
          // reordena, então o índice não confunde nada aqui.
          <li key={indice} className="pv-painel flex flex-wrap items-baseline gap-2 px-4 py-3">
            <span className="truncate text-[13px] font-medium text-label-100">
              {item.arquivo.nome}
            </span>
            <span className="leitura text-ink-700">{item.recusa.titulo}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * O cartucho de um arquivo cuja extensão este front não conhece.
 *
 * Não deveria acontecer — a verificação do servidor recusa extensão que ela
 * não reconhece —, mas pode, no dia em que o servidor aceitar um formato antes
 * de a lista daqui saber dele (ver `arquivo-de-rom.ts`). Sumir da prateleira
 * seria pior: a ROM está lá, e a tela precisa dizer isso — com a arte
 * substituta sem console e a nota dizendo o que falta, em vez de um número
 * de acervo que fingiria procedência.
 */
function SemSistema({
  titulo,
  nome,
  bytes,
}: {
  readonly titulo: string;
  readonly nome: string;
  readonly bytes: number;
}) {
  return (
    <div className="pv-cartucho" role="group" aria-label={`${titulo} — ${nome}`}>
      <Arte titulo={titulo} sistema={null} capaUrl={null} />
      <span className="pv-cartucho-titulo">{titulo}</span>
      <span className="pv-cartucho-nota">Sistema não identificado · {emBytesLegiveis(bytes)}</span>
    </div>
  );
}
