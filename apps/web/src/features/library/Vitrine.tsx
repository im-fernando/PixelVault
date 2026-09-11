import { Link } from '@tanstack/react-router';
import { Gamepad2, Play, Upload } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Game } from '@pixelvault/contracts';
import { Arte } from '../../ui/Arte.js';
import { classesDaPilula } from '../../ui/Botao.js';
import { useSessao } from '../auth/sessao.js';
import { useRomsLocais } from './local-roms.js';
import { emBytesLegiveis } from './tamanho.js';
import { useBiblioteca } from './use-biblioteca.js';
import { useGames } from './use-games.js';

/**
 * A vitrine: o jogo em exposição, na abertura da home.
 *
 * É o mesmo palco do modo console — título grande, a caixa em órbita, o
 * botão de jogar — só que aqui a pessoa escolhe com o mouse e não com o
 * controle. O que fica em exposição segue uma ordem honesta: o favorito da
 * biblioteca pessoal, senão o primeiro cartucho dela, senão um homebrew do
 * catálogo público (que é o que quem não tem conta vê). Sem nada disso, a
 * vitrine abre com a tese do produto.
 *
 * Os números embaixo são lidos do conteúdo real, não escritos à mão —
 * acervo que mente a própria contagem não é acervo.
 */
export function Vitrine() {
  const sessao = useSessao();
  const { data: publicos } = useGames();
  const { data: minhas } = useBiblioteca();
  const { data: locais } = useRomsLocais();

  const logado = sessao.estado === 'autenticado';
  const roms = minhas ?? [];
  const daBiblioteca = logado ? (roms.find((rom) => rom.isFavorite) ?? roms[0] ?? null) : null;
  const homebrew = (publicos ?? []).find((game) => game.isHomebrew) ?? null;

  const nPublicos = publicos?.length ?? 0;
  // As duas procedências do que é "seu" somadas: as ROMs enviadas para a conta
  // e as da biblioteca local de desenvolvimento. Contar só uma delas faria a
  // vitrine mentir sobre as prateleiras logo abaixo dela.
  const nSeus = roms.length + (locais?.length ?? 0);

  const contagens = (
    <dl className="mt-9 flex flex-wrap gap-x-10 gap-y-4">
      <Contagem rotulo="no catálogo" valor={nPublicos} nota="jogáveis sem conta" />
      <Contagem rotulo="seus" valor={nSeus} nota="privadas de você" />
      <Contagem rotulo="consoles" valor={1} nota="mais vêm" />
    </dl>
  );

  if (daBiblioteca !== null) {
    return (
      <Palco
        key={daBiblioteca.id}
        arte={
          <Arte
            titulo={daBiblioteca.title}
            sistema={daBiblioteca.systemId}
            capaUrl={daBiblioteca.coverUrl}
          />
        }
      >
        <p className="pv-vitrine-linha">
          <span className="pv-ponto" />
          <span>{daBiblioteca.systemId ?? 'Sistema não identificado'}</span>
          <i />
          {daBiblioteca.isFavorite ? 'Seu favorito' : 'Sua biblioteca'}
        </p>
        <h1 className="titulo-cena text-label-100">{daBiblioteca.title}</h1>
        <p className="pv-vitrine-detalhes">
          {emBytesLegiveis(daBiblioteca.sizeBytes)}
          <span>·</span>
          <span className="leitura">{daBiblioteca.fileName}</span>
          <span>·</span>
          Pronto para jogar
        </p>
        <div className="pv-vitrine-acoes">
          <Link
            to="/biblioteca/$romId"
            params={{ romId: daBiblioteca.id }}
            className={classesDaPilula()}
          >
            <Play size={17} fill="currentColor" /> Jogar
          </Link>
          <Link
            to="/console"
            search={{ jogo: daBiblioteca.id }}
            className={classesDaPilula({ variante: 'secundaria' })}
          >
            <Gamepad2 size={17} /> Abrir no console
          </Link>
        </div>
        {contagens}
      </Palco>
    );
  }

  if (homebrew !== null) {
    return (
      <Palco
        key={homebrew.id}
        arte={
          <Arte titulo={homebrew.title} sistema={homebrew.systemId} capaUrl={homebrew.coverUrl} />
        }
      >
        <p className="pv-vitrine-linha">
          <span className="pv-ponto" />
          <span>{homebrew.systemId}</span>
          <i />
          Catálogo público · jogável sem conta
        </p>
        <h1 className="titulo-cena text-label-100">{homebrew.title}</h1>
        <p className="pv-vitrine-detalhes">{ficha(homebrew)}</p>
        <div className="pv-vitrine-acoes">
          <Link to="/play/$slug" params={{ slug: homebrew.slug }} className={classesDaPilula()}>
            <Play size={17} fill="currentColor" /> Jogar agora
          </Link>
          {logado ? (
            <Link to="/enviar-rom" className={classesDaPilula({ variante: 'secundaria' })}>
              <Upload size={17} /> Enviar minha primeira ROM
            </Link>
          ) : (
            <Link to="/cadastro" className={classesDaPilula({ variante: 'secundaria' })}>
              Criar conta
            </Link>
          )}
        </div>
        {contagens}
      </Palco>
    );
  }

  return (
    <Palco arte={null}>
      <p className="pv-vitrine-linha">
        <span className="pv-ponto" />
        acervo pessoal · super nintendo
      </p>
      <h1 className="titulo-cena text-label-100">
        Cartucho guarda o save numa pilha.
        <br />
        <span className="text-label-400">Pilha acaba.</span>
      </h1>
      <p className="max-w-md text-[14px] leading-relaxed text-ink-500">
        Aqui não acaba. Seu acervo roda no navegador, e o progresso fica onde você deixou — em
        qualquer aparelho.
      </p>
      {contagens}
    </Palco>
  );
}

function ficha(game: Game): ReactNode {
  const partes = [game.publisher, game.releaseYear === null ? null : String(game.releaseYear)]
    .filter((parte): parte is string => parte !== null)
    .flatMap((parte, i) => (i === 0 ? [parte] : [<span key={parte}>·</span>, parte]));
  return partes.length === 0 ? 'Homebrew · roda no navegador' : partes;
}

function Palco({ arte, children }: { readonly arte: ReactNode; readonly children: ReactNode }) {
  return (
    <section className="pv-vitrine" aria-label="Em exposição">
      <div className="pv-vitrine-texto">{children}</div>
      <div className="pv-escultura" aria-hidden="true">
        <div className="pv-orbita" />
        <div className="pv-orbita pv-orbita--dois" />
        {arte !== null && <div className="pv-caixa">{arte}</div>}
        <span className="pv-escultura-legenda">
          Cartucho guarda o save numa pilha. Aqui não acaba.
        </span>
      </div>
    </section>
  );
}

function Contagem({
  rotulo,
  valor,
  nota,
}: {
  readonly rotulo: string;
  readonly valor: number;
  readonly nota: string;
}) {
  return (
    <div className="pv-verbete">
      <dt>{rotulo}</dt>
      <dd className="pv-numero text-[26px]">{String(valor).padStart(2, '0')}</dd>
      <p className="mt-1 text-[11px] text-ink-700">{nota}</p>
    </div>
  );
}
