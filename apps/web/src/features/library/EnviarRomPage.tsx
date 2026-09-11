import { Upload } from 'lucide-react';
import { Fragment, useId, useState, type DragEvent } from 'react';
import { TAMANHO_MAXIMO_DE_ROM_EM_BYTES } from '@pixelvault/contracts';
import { Arte } from '../../ui/Arte.js';
import { BotaoPilula, classesDaPilula } from '../../ui/Botao.js';
import { Aviso, Painel } from '../../ui/Painel.js';
import { Sobrelinha } from '../../ui/Texto.js';
import { EXTENSOES_ACEITAS } from './arquivo-de-rom.js';
import { Cartucho } from './Cartucho.js';
import type { EstadoDoEnvio } from './envio-de-rom.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { emBytesLegiveis } from './tamanho.js';
import { useEnvioDeRom, type RomDaSessao } from './use-envio-de-rom.js';

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
            o jogo.
          </p>
        </header>

        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
          <ZonaDeEntrada ocupado={envio.ocupado} aoEscolher={envio.enviar} />
          <Protocolo estado={envio.estado} aoLimpar={envio.limpar} />
        </div>
      </div>

      {envio.nestaSessao.length > 0 && <NestaSessao itens={envio.nestaSessao} />}
    </>
  );
}

/**
 * Arrastar ou escolher, e nada além disso.
 *
 * Não há campo de sistema, de título nem de hash: o que a pessoa sabe é qual
 * arquivo é dela, e todo o resto — de que console é, se o conteúdo confere,
 * qual o hash — sai do próprio arquivo, aqui ou no servidor. Pedir à pessoa o
 * que a máquina consegue descobrir é transformar um envio em formulário.
 *
 * A pílula "Escolher arquivo" é só desenho dentro do `label`: quem abre o
 * seletor é o `input[type=file]` escondido, e o `label` inteiro é o alvo do
 * clique. Um botão de verdade ali seria elemento interativo dentro de outro.
 */
function ZonaDeEntrada({
  ocupado,
  aoEscolher,
}: {
  readonly ocupado: boolean;
  readonly aoEscolher: (arquivos: readonly File[]) => void;
}) {
  const id = useId();
  const [porCima, setPorCima] = useState(false);

  function aoSoltar(evento: DragEvent<HTMLLabelElement>): void {
    evento.preventDefault();
    setPorCima(false);
    if (!ocupado) aoEscolher(Array.from(evento.dataTransfer.files));
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
      onDrop={aoSoltar}
      className={`pv-zona justify-center ${porCima ? 'pv-zona--por-cima' : ''} ${
        ocupado ? 'pv-zona--ocupada' : ''
      }`}
    >
      <span className="pv-zona-icone" aria-hidden="true">
        <Upload size={26} strokeWidth={1.5} />
      </span>
      <span className="titulo-cena mt-2 text-[22px] text-label-100">
        Solte o arquivo aqui ou escolha um
      </span>
      <span className="max-w-sm text-[13px] leading-relaxed text-ink-500">
        A ROM tem que estar descompactada — o arquivo do cartucho, não o .zip que veio com ele.
      </span>
      <span className="leitura text-ink-700">
        {EXTENSOES_ACEITAS.join(' ')} · até {emBytesLegiveis(TAMANHO_MAXIMO_DE_ROM_EM_BYTES)}
      </span>
      <span className={classesDaPilula({ pequena: true, className: 'mt-3' })} aria-hidden="true">
        Escolher arquivo
      </span>
      <input
        id={id}
        type="file"
        className="sr-only"
        accept={EXTENSOES_ACEITAS.join(',')}
        disabled={ocupado}
        onChange={(evento) => {
          aoEscolher(Array.from(evento.target.files ?? []));
          // Sem isto, escolher o MESMO arquivo depois de uma recusa não dispara
          // `change` nenhum, e a tela fica parada sem que ninguém entenda por quê.
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
  aoLimpar,
}: {
  readonly estado: EstadoDoEnvio;
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
              titulo={item.arquivo.titulo}
              systemId={item.arquivo.systemId}
              nota={`${item.arquivo.systemId.toUpperCase()} · ${emBytesLegiveis(item.rom.sizeBytes)}`}
              rotulo={`${item.arquivo.titulo} — ${item.arquivo.nome}`}
            />
          ),
        )}
      </Prateleira>
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
