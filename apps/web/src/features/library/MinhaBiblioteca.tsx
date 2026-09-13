import { Link } from '@tanstack/react-router';
import { Heart, Play, Search, Trash2, Trophy, Upload } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type { LibraryRom } from '@pixelvault/contracts';
import { BotaoIcone, BotaoPilula, classesDaPilula } from '../../ui/Botao.js';
import { Aviso, Vazio } from '../../ui/Painel.js';
import { useSessao } from '../auth/sessao.js';
import { Cartucho } from './Cartucho.js';
import { ConfirmarRemocao } from './ConfirmarRemocao.js';
import { IdentificarCapa } from './IdentificarCapa.js';
import { CartuchoEsqueleto, EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { filtrarBiblioteca, type OrdemDaBiblioteca } from './filtrar-biblioteca.js';
import { emBytesLegiveis } from './tamanho.js';
import { useBiblioteca, useFavoritarRom, useRemoverRom } from './use-biblioteca.js';

/**
 * A estante pessoal: as ROMs que a pessoa enviou, na home.
 *
 * ## Por que na home, e não numa rota própria
 *
 * Porque a home **é** a estante. Ela abre com a vitrine e segue em
 * prateleiras; mandar a coleção da pessoa para `/minha-biblioteca` faria a
 * página inicial de quem tem cinquenta ROMs mostrar só o homebrew dos outros,
 * e a coleção dela viraria um lugar aonde se vai. O envio ganhou rota própria
 * (`/enviar-rom`) porque é uma **tarefa** com começo, meio e fim; uma estante
 * não é tarefa, é onde as coisas ficam.
 *
 * Vem antes do catálogo público pelo mesmo motivo: o que é seu primeiro. Para
 * quem não está logado a seção simplesmente não existe.
 *
 * ## O que o cartucho faz
 *
 * A barra que aparece sobre a arte tem as quatro ações que ele aceita:
 * "Jogar" leva a `/biblioteca/:romId` (#99), o coração favorita, o troféu
 * abre o ranking (#122, só para ROM reconhecida no catálogo) e a lixeira
 * pede confirmação antes de tirar do acervo.
 */
export function MinhaBiblioteca() {
  const sessao = useSessao();
  const { data: roms, isPending, error, refetch, isFetching } = useBiblioteca();
  const [busca, setBusca] = useState('');
  const [soFavoritos, setSoFavoritos] = useState(false);
  const [ordem, setOrdem] = useState<OrdemDaBiblioteca>('original');
  const [emBaixa, setEmBaixa] = useState<LibraryRom | null>(null);
  const [identificando, setIdentificando] = useState<{
    readonly gameId: string;
    readonly titulo: string;
  } | null>(null);
  const remover = useRemoverRom();

  if (sessao.estado !== 'autenticado') return null;

  if (error) {
    return (
      <Secao>
        <EtiquetaDeGaveta nome="Minha biblioteca" itens={0} nota="privadas da sua conta" />
        <Aviso
          titulo="Não foi possível carregar sua biblioteca"
          className="mt-5"
          acao={
            <BotaoPilula pequena disabled={isFetching} onClick={() => void refetch()}>
              {isFetching ? 'Tentando…' : 'Tentar novamente'}
            </BotaoPilula>
          }
        >
          Confira sua conexão e tente novamente. Seus jogos continuam na sua conta.
        </Aviso>
      </Secao>
    );
  }

  if (isPending) {
    return (
      <Secao>
        <EtiquetaDeGaveta nome="Minha biblioteca" itens={0} nota="privadas da sua conta" />
        <p role="status" className="pv-ajuda">
          Carregando sua biblioteca…
        </p>
        <Prateleira>
          {Array.from({ length: 5 }, (_, i) => (
            <CartuchoEsqueleto key={i} />
          ))}
        </Prateleira>
      </Secao>
    );
  }

  if (roms.length === 0) return <EstanteVazia />;

  const visiveis = filtrarBiblioteca(roms, busca, soFavoritos, ordem);
  const limpar = () => {
    setBusca('');
    setSoFavoritos(false);
    setOrdem('original');
  };
  const bytes = roms.reduce((soma, rom) => soma + rom.sizeBytes, 0);

  return (
    <Secao>
      <EtiquetaDeGaveta
        nome="Minha biblioteca"
        itens={roms.length}
        bytes={bytes}
        nota="privadas da sua conta"
      />
      <div className="pv-filtros" role="search" aria-label="Buscar na minha biblioteca">
        <label className="pv-filtros-busca">
          <span className="pv-rotulo">Buscar jogo</span>
          <input
            type="search"
            className="pv-campo"
            placeholder="Nome do jogo ou do arquivo"
            value={busca}
            onChange={(evento) => setBusca(evento.target.value)}
          />
        </label>
        <label>
          <span className="pv-rotulo">Ordenar por</span>
          <select
            className="pv-campo"
            value={ordem}
            onChange={(evento) => setOrdem(evento.target.value as OrdemDaBiblioteca)}
          >
            <option value="original">Favoritos primeiro</option>
            <option value="titulo">Nome: A–Z</option>
            <option value="tamanho">Maior tamanho</option>
          </select>
        </label>
        <BotaoPilula
          variante={soFavoritos ? 'principal' : 'secundaria'}
          aria-pressed={soFavoritos}
          onClick={() => setSoFavoritos(!soFavoritos)}
        >
          <Heart size={16} aria-hidden="true" /> Só favoritos
        </BotaoPilula>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-ink-500">
          {visiveis.length} de {roms.length} {roms.length === 1 ? 'jogo' : 'jogos'}
        </p>
        {(busca !== '' || soFavoritos || ordem !== 'original') && (
          <BotaoPilula pequena variante="secundaria" onClick={limpar}>
            Limpar filtros
          </BotaoPilula>
        )}
      </div>
      {visiveis.length === 0 && (
        <Vazio
          className="mt-5"
          titulo="Nenhum jogo encontrado."
          acao={
            <BotaoPilula pequena onClick={limpar}>
              Mostrar todos os jogos
            </BotaoPilula>
          }
        >
          Tente outro nome ou remova o filtro de favoritos para ver sua coleção.
        </Vazio>
      )}
      <Prateleira>
        {visiveis.map((rom) => {
          const gameId = rom.gameId;
          return (
            <NaEstante
              key={rom.id}
              rom={rom}
              aoRemover={() => setEmBaixa(rom)}
              aoIdentificarCapa={
                gameId === null ? null : () => setIdentificando({ gameId, titulo: rom.title })
              }
            />
          );
        })}
      </Prateleira>

      {identificando !== null && (
        <IdentificarCapa
          gameId={identificando.gameId}
          tituloSugerido={identificando.titulo}
          fechar={() => setIdentificando(null)}
        />
      )}

      {emBaixa !== null && (
        <ConfirmarRemocao
          rom={emBaixa}
          removendo={remover.isPending}
          erro={remover.error === null ? null : 'Não deu para remover agora. Tente de novo.'}
          aoCancelar={() => {
            remover.reset();
            setEmBaixa(null);
          }}
          aoConfirmar={() => {
            remover.mutate(emBaixa.id, {
              onSuccess: () => {
                setEmBaixa(null);
              },
            });
          }}
        />
      )}
    </Secao>
  );
}

function Secao({ children }: { readonly children: ReactNode }) {
  return <section className="mt-10">{children}</section>;
}

/**
 * A gaveta vazia é convite, e não erro (docs/design.md): quem ainda não enviou
 * nada precisa do caminho, e não de um retângulo tracejado dizendo "nada aqui".
 */
function EstanteVazia() {
  return (
    <Secao>
      <EtiquetaDeGaveta nome="Minha biblioteca" itens={0} nota="privadas da sua conta" />
      <Vazio
        className="mt-5"
        titulo="Sua estante está vazia."
        acao={
          <Link to="/enviar-rom" className={classesDaPilula({ pequena: true })}>
            <Upload size={15} /> Enviar uma ROM
          </Link>
        }
      >
        As ROMs que você enviar ficam aqui, privadas da sua conta. Ninguém mais as baixa.
      </Vazio>
    </Secao>
  );
}

/**
 * Um cartucho da estante pessoal, com as ações que ele aceita.
 *
 * O `role="group"` com `aria-label` (dentro de `Cartucho`) é o que dá
 * contexto aos botões: eles se chamam "Favoritar" e "Remover" e nada mais,
 * porque quem os alcança já entrou no grupo daquele cartucho e ouviu o nome
 * dele. O nome do arquivo entra no rótulo porque quem tem duas versões do
 * mesmo jogo precisa distingui-las, e o título das duas é igual.
 */
function NaEstante({
  rom,
  aoRemover,
  aoIdentificarCapa,
}: {
  readonly rom: LibraryRom;
  readonly aoRemover: () => void;
  /** `null` quando não há jogo do catálogo para guardar a capa — botão nem aparece. */
  readonly aoIdentificarCapa: (() => void) | null;
}) {
  const favoritar = useFavoritarRom();

  return (
    <Cartucho
      titulo={rom.title}
      systemId={rom.systemId}
      capaUrl={rom.coverUrl}
      favorito={rom.isFavorite}
      nota={`${rom.systemId?.toUpperCase() ?? 'ROM'} · ${emBytesLegiveis(rom.sizeBytes)}`}
      rotulo={`${rom.title} — ${rom.fileName}`}
      acoes={
        <>
          <Link to="/biblioteca/$romId" params={{ romId: rom.id }}>
            <Play size={13} fill="currentColor" /> Jogar
          </Link>
          <BotaoIcone
            rotulo={rom.isFavorite ? 'Desfavoritar' : 'Favoritar'}
            aria-pressed={rom.isFavorite}
            disabled={favoritar.isPending}
            onClick={() => favoritar.mutate({ romId: rom.id, favorito: !rom.isFavorite })}
          >
            <Heart size={15} fill={rom.isFavorite ? 'currentColor' : 'none'} />
          </BotaoIcone>
          {
            // Só quando há jogo casado E ele ainda não tem capa — jogo sem
            // capa mas sem `gameId` não tem onde a capa encontrada seria
            // guardada, e jogo com capa não tem o que procurar.
            rom.coverUrl === null && aoIdentificarCapa !== null && (
              <BotaoIcone rotulo="Identificar capa" onClick={aoIdentificarCapa}>
                <Search size={15} />
              </BotaoIcone>
            )
          }
          {
            // Ranking (#122) é POR JOGO do catálogo, não por arquivo — só
            // existe link para quem já tem `gameId` (hash reconhecido, ADR
            // 0006). ROM ainda não reconhecida simplesmente não ganha o
            // botão, do mesmo jeito que ela não ganha capa antes do match.
            rom.gameId !== null && (
              <Link
                to="/ranking/$gameId"
                params={{ gameId: rom.gameId }}
                className="pv-icone"
                aria-label="Ranking"
                title="Ranking"
              >
                <Trophy size={15} />
              </Link>
            )
          }
          <BotaoIcone rotulo="Remover" className="pv-icone--perigo" onClick={aoRemover}>
            <Trash2 size={15} />
          </BotaoIcone>
        </>
      }
    />
  );
}
