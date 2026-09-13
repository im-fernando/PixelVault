import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import type { EmulatorRegistry, RomSource } from '@pixelvault/emulator-runtime';
import { romFromUrl } from '@pixelvault/emulator-runtime';
import { ApiRequestError } from '../../lib/api.js';
import { classesDaPilula } from '../../ui/Botao.js';
import { Aviso } from '../../ui/Painel.js';
import { useDownloadDeRom } from '../library/download-de-rom.js';
import { useBiblioteca } from '../library/use-biblioteca.js';
import { AdocaoDeSram } from './AdocaoDeSram.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo, TelaDeJogoFantasma } from './FichaDeAcervo.js';
import { IndicadorDeSincronizacao } from './IndicadorDeSincronizacao.js';
import { PlayerErrorBoundary } from './PlayerErrorBoundary.js';
import type { SaveStorage } from './storage/index.js';
import { useSincronizacaoDeSram } from './sram-sincronizacao.js';
import { ConsoleGameStatus } from '../console/ConsoleGameStatus.js';

interface Props {
  readonly romId: string;
  readonly aoSairDoConsole?: (() => void) | undefined;
  /** Injetável para teste, do mesmo jeito que `EmulatorPlayer` aceita. */
  readonly registry?: EmulatorRegistry | undefined;
  /** Injetável para teste — mesma porta que `AdocaoDeSram` e `useSincronizacaoDeSram` aceitam. */
  readonly storage?: SaveStorage | undefined;
}

/**
 * Joga uma ROM da biblioteca pessoal — o terceiro caminho do player, ao lado
 * do catálogo público (`PlayPage`) e do ensaio de desenvolvimento
 * (`LocalPlayPage`, que continua existindo — ver o comentário dela).
 *
 * A ROM é privada da conta (BYOR, ADR 0006): os bytes só saem depois que
 * `GET /library/roms/:romId/download` confirmar, no banco, que a linha é de
 * quem pediu. `romId` de outra conta e `romId` inexistente respondem o mesmo
 * 404 (`autorizar-download-de-rom.ts`) — por isso este componente não tenta
 * separar os dois casos na tela, e mostra a mesma recusa genérica para ambos.
 *
 * `título` e `systemId` não vêm do download: ele só sabe hash, nome de
 * arquivo e tamanho (ADR 0013). Pedir os dois numa rota própria seria uma
 * viagem a mais para responder o que `GET /library/roms` já responde — e essa
 * lista já está no cache do React Query por causa da estante na home
 * (`useBiblioteca`). Este componente só filtra a linha certa nela.
 */
export function BibliotecaPlayPage({ romId, registry, storage, aoSairDoConsole }: Props) {
  const biblioteca = useBiblioteca();
  const download = useDownloadDeRom(romId);

  const item = biblioteca.data?.find((rom) => rom.id === romId) ?? null;

  const fonte = useMemo<RomSource | null>(() => {
    if (download.data === undefined) return null;
    return romFromUrl(download.data.url, {
      fileName: download.data.fileName,
      byteLength: download.data.sizeBytes,
    });
  }, [download.data]);

  // Chamado incondicionalmente (regra dos hooks), mesmo com `item` ainda
  // nulo — `systemId: null` faz o hook ficar parado (`pronto: false`) até a
  // ROM resolver. Isso é seguro mesmo quando a ROM nunca vai resolver (dona
  // de outra conta, id inexistente): os `return` abaixo, que tratam esses
  // casos, vêm antes de qualquer checagem de `sincronizacao.pronto`, então
  // eles nunca ficam presos esperando por um `systemId` que não vai vir. Ver
  // `sram-sincronizacao.ts` para o que `pronto` significa.
  const sincronizacao = useSincronizacaoDeSram(romId, item?.systemId ?? null, storage);

  if (biblioteca.isPending || download.isPending) {
    if (aoSairDoConsole)
      return (
        <ConsoleGameStatus
          titulo={item?.title ?? 'Seu próximo universo.'}
          detalhe="Buscando o jogo na sua biblioteca…"
          capaUrl={item?.coverUrl}
          sair={aoSairDoConsole}
        />
      );
    return <TelaDeJogoFantasma />;
  }

  // Erro no download OU ausência na própria lista: as duas coisas viram a
  // mesma tela, sem distinguir "não existe" de "é de outra conta" — o
  // servidor já garante essa igualdade byte a byte na resposta; aqui é só não
  // desfazer o que ele fez.
  if (download.error || item === null) {
    const detalheDoErro =
      download.error instanceof ApiRequestError
        ? `${download.error.payload.code}: ${download.error.payload.message}`
        : null;
    if (aoSairDoConsole)
      return (
        <ConsoleGameStatus
          titulo="ROM não encontrada"
          detalhe={detalheDoErro ?? 'Nada na sua biblioteca com este id.'}
          sair={aoSairDoConsole}
          tentar={() => {
            void download.refetch();
            void biblioteca.refetch();
          }}
        />
      );
    return (
      <Recado
        titulo="ROM não encontrada"
        detalhe={detalheDoErro ?? 'Nada na sua biblioteca com este id.'}
      />
    );
  }

  if (item.systemId === null || fonte === null) {
    if (aoSairDoConsole)
      return (
        <ConsoleGameStatus
          titulo="Sistema não identificado"
          detalhe="Não foi possível reconhecer de qual console é esta ROM."
          sair={aoSairDoConsole}
          tentar={() => {
            void biblioteca.refetch();
          }}
        />
      );
    return (
      <Recado
        titulo="Sistema não identificado"
        detalhe="Não foi possível reconhecer de qual console é esta ROM — o arquivo continua na sua biblioteca, mas o player não sabe que núcleo carregar."
      />
    );
  }

  // Só a partir daqui o `systemId` passado para o hook é real, então só
  // daqui em diante faz sentido esperar por ele — a #91 pode precisar puxar
  // uma SRAM mais nova da nuvem antes de montar o player (ver o cabeçalho de
  // `useSincronizacaoDeSram`).
  if (!sincronizacao.pronto) {
    if (aoSairDoConsole)
      return (
        <ConsoleGameStatus
          titulo={item.title}
          detalhe="Preparando seu progresso…"
          capaUrl={item.coverUrl}
          sair={aoSairDoConsole}
        />
      );
    return <TelaDeJogoFantasma />;
  }

  const progresso = sincronizacao.vinculado ? (
    <IndicadorDeSincronizacao estado={sincronizacao.estado!} />
  ) : (
    <AdocaoDeSram romId={item.sha256} storage={storage} />
  );

  return (
    <div className={aoSairDoConsole ? 'cgp-library-player' : 'mx-auto max-w-[1180px] space-y-6'}>
      {!aoSairDoConsole && (
        <FichaDeAcervo
          titulo={item.title}
          systemId={item.systemId}
          campos={[
            { rotulo: 'console', valor: item.systemId.toUpperCase(), maquina: true },
            { rotulo: 'procedência', valor: 'sua ROM' },
            { rotulo: 'sha-256', valor: `${item.sha256.slice(0, 12)}…`, maquina: true },
          ]}
        />
      )}

      {/*
        Nunca as duas ao mesmo tempo (#91): sem vínculo, a oferta de adoção
        da #92 decide o que fazer com a colisão entre local e nuvem; com
        vínculo, a sincronização já assumiu e o indicador é só informação de
        rodapé. `sincronizacao.estado` só é `null` quando `vinculado` é
        `false` (ver `sram-sincronizacao.ts`), daí o `!` abaixo ser seguro.
      */}
      {!aoSairDoConsole && progresso}

      <PlayerErrorBoundary
        fallback={
          aoSairDoConsole
            ? (erro, tentar) => (
                <ConsoleGameStatus
                  titulo="A partida parou de responder"
                  detalhe={erro.message}
                  sair={aoSairDoConsole}
                  tentar={tentar}
                />
              )
            : undefined
        }
      >
        <EmulatorPlayer
          systemId={item.systemId}
          rom={fonte}
          titulo={item.title}
          romId={item.sha256}
          registry={registry}
          onSramWritten={sincronizacao.registrarGravacaoLocal}
          sincronizarSaveStateNaNuvem
          romIdNaBiblioteca={item.id}
          saveStateStorage={storage}
          modoConsole={
            aoSairDoConsole
              ? { capaUrl: item.coverUrl, aoSair: aoSairDoConsole, progresso }
              : undefined
          }
          // Playtime honesto (#119): só manda heartbeat quando a própria ROM
          // já tem `gameId` — sem isso o servidor não teria onde creditar
          // (docs/adr/0009, decisão 3), e nem vale a viagem de rede. `romId`
          // aqui é o `id` da linha da biblioteca (prop deste componente), não
          // o `item.sha256` que o player usa para o storage local.
          romIdParaHeartbeat={item.gameId !== null ? romId : undefined}
        />
      </PlayerErrorBoundary>
    </div>
  );
}

function Recado({ titulo, detalhe }: { readonly titulo: string; readonly detalhe: string }) {
  return (
    <Aviso
      className="mx-auto max-w-[1180px]"
      titulo={titulo}
      acao={
        <Link to="/" className={classesDaPilula({ variante: 'secundaria', pequena: true })}>
          Voltar para a biblioteca
        </Link>
      }
    >
      {detalhe}
    </Aviso>
  );
}
