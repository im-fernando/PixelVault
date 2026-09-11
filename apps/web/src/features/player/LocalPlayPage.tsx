import { Link } from '@tanstack/react-router';
import { useMemo } from 'react';
import { romFromUrl, type RomSource } from '@pixelvault/emulator-runtime';
import { classesDaPilula } from '../../ui/Botao.js';
import { Aviso } from '../../ui/Painel.js';
import { urlDaRomLocal, useRomLocal } from '../library/local-roms.js';
import { EmulatorPlayer } from './EmulatorPlayer.js';
import { FichaDeAcervo, TelaDeJogoFantasma } from './FichaDeAcervo.js';
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

  if (isPending) return <TelaDeJogoFantasma />;

  if (rom === null || fonte === null) {
    return (
      <Aviso
        className="mx-auto max-w-[1180px]"
        titulo="ROM local não encontrada"
        acao={
          <Link to="/" className={classesDaPilula({ variante: 'secundaria', pequena: true })}>
            Voltar para a biblioteca
          </Link>
        }
      >
        Nada com o id &quot;{id}&quot; em{' '}
        <code className="leitura">apps/web/public/roms-local/manifest.json</code>.
      </Aviso>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px] space-y-6">
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
