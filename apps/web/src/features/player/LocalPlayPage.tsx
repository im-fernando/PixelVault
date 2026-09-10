import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { romFromUrl, type RomSource } from '@pixelvault/emulator-runtime';
import { urlDaRomLocal, useRomLocal } from '../library/local-roms.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo } from './FichaDeAcervo.js';
import { PlayerErrorBoundary } from './PlayerErrorBoundary.js';

interface Props {
  readonly id: string;
}

/**
 * Ensaio de desenvolvimento: joga uma ROM listada em
 * `apps/web/public/roms-local/manifest.json`, sem API e sem conta.
 *
 * Desde a #99 existe o caminho real para a biblioteca pessoal de verdade —
 * `/biblioteca/$romId` (`BibliotecaPlayPage`), que lê a ROM autenticada da
 * API. Esta rota continua existindo ao lado dele, de propósito: é o jeito
 * mais rápido de testar o player contra uma ROM sem precisar de conta, envio
 * nem servidor no ar — só um arquivo em `public/roms-local`. Não é o caminho
 * que a M4 (save na nuvem) usa; a adoção de save (#92) e a sincronização
 * automática (#91) vivem em `BibliotecaPlayPage`.
 */
export function LocalPlayPage({ id }: Props) {
  const { data: rom, isPending } = useRomLocal(id);

  const fonte = useMemo<RomSource | null>(
    () =>
      rom === null
        ? null
        : romFromUrl(urlDaRomLocal(rom), { fileName: rom.file, byteLength: rom.sizeBytes }),
    [rom],
  );

  if (isPending) {
    return <div className="aspect-video w-full animate-pulse rounded-xl bg-ink-850" />;
  }

  if (rom === null || fonte === null) {
    return (
      <div className="rounded-xl border border-ink-850 bg-ink-900 p-8 text-center">
        <h2 className="font-semibold text-alert">ROM local não encontrada</h2>
        <p className="mx-auto mt-2 max-w-md text-sm text-ink-500">
          Nada com o id &quot;{id}&quot; em <code>apps/web/public/roms-local/manifest.json</code>.
        </p>
        <Link
          to="/"
          className="mt-5 inline-block rounded-md border border-ink-700 px-4 py-2 text-sm text-label-100 hover:border-alert"
        >
          Voltar para a biblioteca
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <FichaDeAcervo
        titulo={rom.title}
        systemId={rom.systemId}
        campos={[
          { rotulo: 'console', valor: rom.systemId.toUpperCase(), maquina: true },
          { rotulo: 'procedência', valor: 'sua ROM, servida daqui' },
          { rotulo: 'tamanho', valor: `${(rom.sizeBytes / 1024).toFixed(0)} KB`, maquina: true },
          {
            rotulo: 'sha-256',
            valor: `${rom.sha256.slice(0, 12)}…`,
            maquina: true,
          },
          ...(rom.temHeaderDeCopiador
            ? [{ rotulo: 'cabeçalho', valor: '512 B de copiador', maquina: true }]
            : []),
        ]}
      />

      <PlayerErrorBoundary>
        <EmulatorPlayer systemId={rom.systemId} rom={fonte} titulo={rom.title} romId={rom.sha256} />
      </PlayerErrorBoundary>
    </div>
  );
}
