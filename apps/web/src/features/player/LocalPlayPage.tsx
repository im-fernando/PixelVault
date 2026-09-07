import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { romFromUrl, type RomSource } from '@pixelvault/emulator-runtime';
import { urlDaRomLocal, useRomLocal } from '../library/local-roms.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { PlayerErrorBoundary } from './PlayerErrorBoundary.js';

interface Props {
  readonly id: string;
}

/**
 * Joga uma ROM da biblioteca pessoal.
 *
 * Não passa pela API de propósito: a ROM é da pessoa e está na máquina dela.
 * O caminho do catálogo público (`/play/$slug`) continua servindo só homebrew.
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
      <header>
        <Link to="/" className="text-xs text-ink-700 hover:text-ink-500">
          ← Biblioteca
        </Link>
        <h1 className="mt-1 text-2xl font-bold">{rom.title}</h1>
        <p className="text-sm text-ink-700">
          {rom.systemId.toUpperCase()} · sua ROM, servida da sua máquina
          {rom.temHeaderDeCopiador && ' · com header de copiador'}
        </p>
      </header>

      <PlayerErrorBoundary>
        <EmulatorPlayer systemId={rom.systemId} rom={fonte} titulo={rom.title} />
      </PlayerErrorBoundary>
    </div>
  );
}
