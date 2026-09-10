import { useMemo } from 'react';
import { Link } from '@tanstack/react-router';
import type { EmulatorRegistry, RomSource } from '@pixelvault/emulator-runtime';
import { romFromUrl } from '@pixelvault/emulator-runtime';
import { ApiRequestError } from '../../lib/api.js';
import { useDownloadDeRom } from '../library/download-de-rom.js';
import { useBiblioteca } from '../library/use-biblioteca.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo } from './FichaDeAcervo.js';
import { PlayerErrorBoundary } from './PlayerErrorBoundary.js';

interface Props {
  readonly romId: string;
  /** Injetável para teste, do mesmo jeito que `EmulatorPlayer` aceita. */
  readonly registry?: EmulatorRegistry | undefined;
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
export function BibliotecaPlayPage({ romId, registry }: Props) {
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

  if (biblioteca.isPending || download.isPending) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-ink-850" />
        <div className="aspect-video w-full animate-pulse rounded-xl bg-ink-850" />
      </div>
    );
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
    return (
      <Recado
        titulo="ROM não encontrada"
        detalhe={detalheDoErro ?? 'Nada na sua biblioteca com este id.'}
      />
    );
  }

  if (item.systemId === null || fonte === null) {
    return (
      <Recado
        titulo="Sistema não identificado"
        detalhe="Não foi possível reconhecer de qual console é esta ROM — o arquivo continua na sua biblioteca, mas o player não sabe que núcleo carregar."
      />
    );
  }

  return (
    <div className="space-y-5">
      <FichaDeAcervo
        titulo={item.title}
        systemId={item.systemId}
        campos={[
          { rotulo: 'console', valor: item.systemId.toUpperCase(), maquina: true },
          { rotulo: 'procedência', valor: 'sua ROM' },
          { rotulo: 'sha-256', valor: `${item.sha256.slice(0, 12)}…`, maquina: true },
        ]}
      />

      <PlayerErrorBoundary>
        <EmulatorPlayer
          systemId={item.systemId}
          rom={fonte}
          titulo={item.title}
          romId={item.sha256}
          registry={registry}
        />
      </PlayerErrorBoundary>
    </div>
  );
}

function Recado({ titulo, detalhe }: { readonly titulo: string; readonly detalhe: string }) {
  return (
    <div className="rounded-xl border border-ink-850 bg-ink-900 p-8 text-center">
      <h2 className="font-semibold text-alert">{titulo}</h2>
      <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">{detalhe}</p>
      <Link
        to="/"
        className="mt-5 inline-block rounded-md border border-ink-700 px-4 py-2 text-sm text-label-100 hover:border-alert"
      >
        Voltar para a biblioteca
      </Link>
    </div>
  );
}
