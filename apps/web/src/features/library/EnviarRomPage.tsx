import { useId, useState, type DragEvent } from 'react';
import { TAMANHO_MAXIMO_DE_ROM_EM_BYTES } from '@pixelvault/contracts';
import { EXTENSOES_ACEITAS } from './arquivo-de-rom.js';
import { Cartucho } from './Cartucho.js';
import type { EstadoDoEnvio } from './envio-de-rom.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { useEnvioDeRom, type RomDaSessao } from './use-envio-de-rom.js';

/**
 * A mesa de recepção do acervo: é aqui que a ROM da pessoa entra.
 *
 * A tela é organizada em torno do que a ADR 0014 obriga a mostrar — que
 * existe um passo de verificação entre "enviei" e "está na minha biblioteca".
 * Por isso o miolo não é uma barra de progresso e sim um **protocolo de
 * entrada**: três linhas, na ordem em que acontecem, cada uma dizendo o que
 * está sendo feito. Terminar não apaga as linhas; elas ficam como o carimbo
 * do que foi feito, que é o que um arquivo guardaria.
 *
 * O desenho fica quieto de propósito (docs/design.md): a ousadia do produto
 * está gasta na prateleira, e a prateleira aparece aqui no fim, com o que
 * acabou de entrar.
 */
export function EnviarRomPage() {
  const envio = useEnvioDeRom();

  return (
    <>
      {/*
        A tarefa é estreita e a prateleira não: o miolo do envio fica numa
        coluna de leitura, e a fileira do fim sai dela para sangrar até a borda
        da tela, como toda prateleira do produto (docs/design.md).
      */}
      <div className="mx-auto max-w-3xl px-6">
        <div className="border-b-2 border-ink-850 pb-1.5">
          <h1 className="titulo-estampado text-lg text-label-100">Enviar ROM</h1>
        </div>
        <p className="mt-3 max-w-prose text-sm leading-relaxed text-ink-500">
          O acervo é seu: a ROM que você enviar fica privada da sua conta, e ninguém mais a baixa.
          Nós guardamos o arquivo e o catálogo cuida do resto — capa, nome, ano — quando reconhece o
          jogo.
        </p>

        <ZonaDeEntrada ocupado={envio.ocupado} aoEscolher={envio.enviar} />

        <Protocolo estado={envio.estado} aoLimpar={envio.limpar} />
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
      className={`mt-8 flex cursor-pointer flex-col items-center border border-dashed px-6 py-12 text-center transition-colors focus-within:border-label-400 ${
        porCima
          ? 'border-label-400 bg-ink-900'
          : 'border-ink-850 bg-ink-900/40 hover:border-ink-700'
      } ${ocupado ? 'pointer-events-none opacity-45' : ''}`}
    >
      <span className="titulo-estampado text-sm text-label-100">
        Solte o arquivo aqui ou escolha um
      </span>
      <span className="mt-2 max-w-sm text-xs leading-relaxed text-ink-500">
        A ROM tem que estar descompactada — o arquivo do cartucho, não o .zip que veio com ele.
      </span>
      <span className="leitura mt-4 text-ink-700">
        {EXTENSOES_ACEITAS.join(' ')} · até {emMegabytes(TAMANHO_MAXIMO_DE_ROM_EM_BYTES)}
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

/** As três linhas do protocolo, na ordem em que acontecem. */
const PASSOS = ['Enviando', 'Verificando', 'Na biblioteca'] as const;

/** Em que linha o fluxo está. `-1` é "nem começou". */
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
  if (estado.fase === 'ocioso') return null;

  if (estado.fase === 'recusado') {
    return (
      <div role="alert" className="mt-8 border-l-2 border-alert bg-ink-900 px-5 py-4">
        <p className="titulo-estampado text-sm text-label-100">{estado.recusa.titulo}</p>
        <p className="mt-1.5 max-w-prose text-sm leading-relaxed text-ink-500">
          {estado.recusa.detalhe}
        </p>
        <p className="leitura mt-3 truncate text-ink-700">
          {estado.arquivo.nome} · {emMegabytes(estado.arquivo.sizeBytes)}
        </p>
        <button
          type="button"
          onClick={aoLimpar}
          className="mt-4 border border-ink-700 px-3 py-1 text-xs text-label-200 outline-none hover:border-label-400 hover:text-label-100 focus-visible:border-label-400"
        >
          Escolher outro arquivo
        </button>
      </div>
    );
  }

  const atual = linhaAtual(estado);
  // Terminou, as três linhas estão cumpridas — inclusive quando o atalho do
  // hash pulou o envio e a verificação de verdade: o destino é o mesmo, e a
  // nota da última linha diz por que foi tão rápido em vez de fingir um envio.
  const cumpridas = estado.fase === 'pronto' ? PASSOS.length : atual;

  return (
    <div className="mt-8 border border-ink-850 bg-ink-900/40 px-5 py-4">
      <p className="truncate text-sm text-label-100">{estado.arquivo.nome}</p>
      <p className="leitura mt-1 text-ink-700">
        {emMegabytes(estado.arquivo.sizeBytes)}
        {estado.arquivo.systemId !== null && ` · ${estado.arquivo.systemId.toUpperCase()}`}
      </p>

      <ol className="mt-5 space-y-3">
        {PASSOS.map((nome, indice) => (
          <Linha
            key={nome}
            nome={nome}
            situacao={indice < cumpridas ? 'feita' : indice === atual ? 'agora' : 'adiante'}
          >
            {notaDaLinha(estado, indice)}
          </Linha>
        ))}
      </ol>

      {estado.fase === 'enviando' && (
        <Barra total={estado.arquivo.sizeBytes} feito={estado.bytesEnviados} />
      )}

      {estado.fase === 'pronto' && (
        <div className="mt-4 border-t border-ink-850 pt-3">
          <p className="leitura break-all text-ink-700">sha256 {estado.rom.sha256}</p>
          <p className="leitura mt-1 text-ink-700">rom {estado.rom.romId}</p>
          <button
            type="button"
            onClick={aoLimpar}
            className="mt-4 border border-ink-700 px-3 py-1 text-xs text-label-200 outline-none hover:border-label-400 hover:text-label-100 focus-visible:border-label-400"
          >
            Enviar outra
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * O que cada linha do protocolo tem a dizer no momento em que está.
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

function Linha({
  nome,
  situacao,
  children,
}: {
  readonly nome: string;
  readonly situacao: 'feita' | 'agora' | 'adiante';
  readonly children: string | null;
}) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden="true"
        className={`mt-[0.3rem] h-2 w-2 shrink-0 ${
          situacao === 'adiante' ? 'border border-ink-700' : 'bg-label-400'
        } ${situacao === 'agora' ? 'animate-pulse' : ''}`}
      />
      <div className="min-w-0">
        <p
          className={`text-sm ${situacao === 'adiante' ? 'text-ink-700' : 'text-label-100'}`}
          aria-current={situacao === 'agora' ? 'step' : undefined}
        >
          {nome}
          {situacao === 'agora' && <span className="sr-only"> (em andamento)</span>}
        </p>
        {children !== null && (
          <p className="mt-0.5 text-xs leading-relaxed text-ink-500">{children}</p>
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
    <div className="mt-4">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={porcento}
        aria-label="Envio da ROM"
        className="h-1 w-full bg-ink-850"
      >
        <div className="h-full bg-label-400 transition-[width]" style={{ width: `${porcento}%` }} />
      </div>
      <p className="leitura mt-1.5 text-ink-700">
        {emMegabytes(feito)} de {emMegabytes(total)} · {porcento}%
      </p>
    </div>
  );
}

/**
 * O que entrou nesta sessão, na prateleira de sempre.
 *
 * É confirmação, não listagem: a biblioteca completa — com favoritar, remover
 * e o acervo inteiro — é a #75. O que esta fileira prova é que o cartucho
 * existe do outro lado, e ela some no próximo F5 sem deixar saudade.
 */
function NestaSessao({ itens }: { readonly itens: readonly RomDaSessao[] }) {
  const bytes = itens.reduce((soma, item) => soma + item.rom.sizeBytes, 0);

  return (
    <section className="mt-12">
      <EtiquetaDeGaveta
        nome="Entrou agora"
        itens={itens.length}
        bytes={bytes}
        nota="só suas · a listagem completa vem na próxima"
      />
      <Prateleira>
        {itens.map((item) => (
          <div key={item.rom.romId} className="group" title={item.arquivo.nome}>
            {item.arquivo.systemId === null ? (
              <SemSistema titulo={item.arquivo.titulo} />
            ) : (
              <Cartucho
                titulo={item.arquivo.titulo}
                systemId={item.arquivo.systemId}
                selo={`${Math.round(item.rom.sizeBytes / 1024)} KB`}
              />
            )}
          </div>
        ))}
      </Prateleira>
    </section>
  );
}

/**
 * O cartucho de um arquivo cuja extensão este front não conhece.
 *
 * Não deveria acontecer — a verificação do servidor recusa extensão que ela
 * não reconhece —, mas pode, no dia em que o servidor aceitar um formato antes
 * de a lista daqui saber dele (ver `arquivo-de-rom.ts`). Some da prateleira
 * seria pior: a ROM está lá, e a tela precisa dizer isso.
 */
function SemSistema({ titulo }: { readonly titulo: string }) {
  return (
    <div className="flex h-[17rem] w-14 shrink-0 items-start justify-center overflow-hidden bg-ink-850 pt-3">
      <p
        className="titulo-estampado text-[0.6rem] leading-none text-label-200"
        style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
      >
        {titulo}
      </p>
    </div>
  );
}

/** Bytes na unidade em que a pessoa pensa neles. */
function emMegabytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
