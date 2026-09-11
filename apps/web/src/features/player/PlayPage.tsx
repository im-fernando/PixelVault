import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { romFromUrl, type RomSource } from '@pixelvault/emulator-runtime';
import type { HomebrewRom } from '@pixelvault/contracts';
import { useGame } from '../library/use-game.js';
import { ApiRequestError } from '../../lib/api.js';
import { classesDaPilula } from '../../ui/Botao.js';
import { Aviso } from '../../ui/Painel.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo, TelaDeJogoFantasma } from './FichaDeAcervo.js';
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

  if (isPending) return <TelaDeJogoFantasma />;

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
    <div className="mx-auto max-w-[1180px] space-y-6">
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
        <PlayerErrorBoundary>
          <EmulatorPlayer
            systemId={jogo.systemId}
            rom={rom}
            titulo={jogo.title}
            romId={jogo.homebrewRom?.sha256}
          />
        </PlayerErrorBoundary>
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
