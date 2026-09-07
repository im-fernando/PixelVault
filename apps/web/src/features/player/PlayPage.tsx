import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { romFromUrl, type RomSource } from '@pixelvault/emulator-runtime';
import type { HomebrewRom } from '@pixelvault/contracts';
import { useGame } from '../library/use-game.js';
import { ApiRequestError } from '../../lib/api.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo } from './FichaDeAcervo.js';
import { PlayerErrorBoundary } from './PlayerErrorBoundary.js';

interface Props {
  readonly slug: string;
}

/**
 * A tela em que a pessoa joga.
 *
 * Sem login e sem upload: homebrew é público por decisão de produto, e a
 * primeira coisa que alguém faz ao abrir o PixelVault precisa ser jogar. Ver
 * docs/adr/0006.
 */
export function PlayPage({ slug }: Props) {
  const { data: jogo, isPending, error } = useGame(slug);

  const rom = useMemo<RomSource | null>(() => {
    const referencia = jogo?.homebrewRom ?? null;
    return referencia === null ? null : fonteDaRom(referencia);
  }, [jogo?.homebrewRom]);

  if (isPending) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 animate-pulse rounded bg-ink-850" />
        <div className="aspect-video w-full animate-pulse rounded-xl bg-ink-850" />
      </div>
    );
  }

  if (error) {
    const naoEncontrado = error instanceof ApiRequestError && error.status === 404;
    return (
      <Recado
        titulo={naoEncontrado ? 'Jogo não encontrado' : 'Falha ao abrir o jogo'}
        detalhe={
          naoEncontrado
            ? `Nada no catálogo com o slug "${slug}".`
            : error instanceof ApiRequestError
              ? `${error.payload.code}: ${error.payload.message}`
              : 'Não foi possível falar com a API.'
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <FichaDeAcervo
        titulo={jogo.title}
        systemId={jogo.systemId}
        campos={[
          { rotulo: 'console', valor: jogo.systemId.toUpperCase(), maquina: true },
          { rotulo: 'procedência', valor: jogo.isHomebrew ? 'homebrew · público' : 'sua ROM' },
          ...(jogo.publisher === null ? [] : [{ rotulo: 'autor', valor: jogo.publisher }]),
          ...(jogo.releaseYear === null
            ? []
            : [{ rotulo: 'ano', valor: String(jogo.releaseYear), maquina: true }]),
          ...(jogo.homebrewRom === null
            ? []
            : [
                {
                  rotulo: 'sha-256',
                  valor: `${jogo.homebrewRom.sha256.slice(0, 12)}…`,
                  maquina: true,
                },
              ]),
        ]}
      />

      {rom === null ? (
        <Recado
          titulo="Este jogo precisa da sua ROM"
          detalhe="O catálogo é de metadados: só homebrew é servido por nós. Envie o seu arquivo quando a biblioteca pessoal chegar."
        />
      ) : (
        <>
          <PlayerErrorBoundary>
            <EmulatorPlayer
              systemId={jogo.systemId}
              rom={rom}
              titulo={jogo.title}
              romId={jogo.homebrewRom?.sha256}
            />
          </PlayerErrorBoundary>
        </>
      )}
    </div>
  );
}

/**
 * `romFromUrl` e não bytes: o adapter decide como consumir a ROM — em pedaços,
 * por streaming ou de uma vez. Baixar 4 MB aqui para reentregar ao core seria
 * escolher por ele, e escolher errado no dia do primeiro console de disco.
 */
function fonteDaRom(referencia: HomebrewRom): RomSource {
  return romFromUrl(referencia.url, {
    fileName: referencia.fileName,
    ...(referencia.sizeBytes === null ? {} : { byteLength: referencia.sizeBytes }),
  });
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
