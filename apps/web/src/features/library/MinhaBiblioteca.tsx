import { Link } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import type { LibraryRom } from '@pixelvault/contracts';
import { ApiRequestError } from '../../lib/api.js';
import { useSessao } from '../auth/sessao.js';
import { Cartucho } from './Cartucho.js';
import { ConfirmarRemocao } from './ConfirmarRemocao.js';
import { EtiquetaDeGaveta, Prateleira } from './Prateleira.js';
import { emBytesLegiveis } from './tamanho.js';
import { useBiblioteca, useFavoritarRom, useRemoverRom } from './use-biblioteca.js';

/**
 * A estante pessoal: as ROMs que a pessoa enviou, na home.
 *
 * ## Por que na home, e não numa rota própria
 *
 * Porque a home **é** a estante. Ela abre com o frontispício de um acervo e
 * segue em prateleiras; mandar a coleção da pessoa para `/minha-biblioteca`
 * faria a página inicial de quem tem cinquenta ROMs mostrar só o homebrew dos
 * outros, e a coleção dela viraria um lugar aonde se vai. O envio ganhou rota
 * própria (`/enviar-rom`) porque é uma **tarefa** com começo, meio e fim; uma
 * estante não é tarefa, é onde as coisas ficam.
 *
 * Vem antes do catálogo público pelo mesmo motivo: o que é seu primeiro. Para
 * quem não está logado a seção simplesmente não existe, e a home continua como
 * era.
 *
 * ## O que o cartucho faz quando clicado
 *
 * Nada, por enquanto — e é honesto que seja assim. Jogar uma ROM enviada
 * precisa do player lendo a URL assinada de `/library/roms/:romId/download`, e
 * isso não existe ainda. Um cartucho que parece link e não leva a lugar nenhum
 * seria pior que um cartucho que não parece link.
 */
export function MinhaBiblioteca() {
  const sessao = useSessao();
  const { data: roms, isPending, error } = useBiblioteca();
  const [emBaixa, setEmBaixa] = useState<LibraryRom | null>(null);
  const remover = useRemoverRom();

  if (sessao.estado !== 'autenticado') return null;

  if (error) {
    const detalhe =
      error instanceof ApiRequestError
        ? `${error.payload.code}: ${error.payload.message}`
        : 'Não foi possível falar com a API.';
    return (
      <Secao>
        <div className="mx-6 border-l-2 border-alert bg-ink-900 p-5">
          <h3 className="titulo-estampado text-sm text-label-100">Sua estante não respondeu</h3>
          <p className="mt-1 text-sm text-ink-500">{detalhe}</p>
        </div>
      </Secao>
    );
  }

  if (isPending) {
    return (
      <Secao>
        <Prateleira>
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-[17rem] w-14 shrink-0 animate-pulse bg-ink-900" />
          ))}
        </Prateleira>
      </Secao>
    );
  }

  if (roms.length === 0) return <EstanteVazia />;

  const bytes = roms.reduce((soma, rom) => soma + rom.sizeBytes, 0);

  return (
    <Secao>
      <EtiquetaDeGaveta
        nome="Minha biblioteca"
        itens={roms.length}
        bytes={bytes}
        nota="privadas da sua conta"
      />
      <Prateleira>
        {roms.map((rom) => (
          <NaEstante key={rom.id} rom={rom} aoRemover={() => setEmBaixa(rom)} />
        ))}
      </Prateleira>

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
  return <section className="mb-12">{children}</section>;
}

/**
 * A gaveta vazia é convite, e não erro (docs/design.md): quem ainda não enviou
 * nada precisa do caminho, e não de um retângulo tracejado dizendo "nada aqui".
 */
function EstanteVazia() {
  return (
    <Secao>
      <EtiquetaDeGaveta nome="Minha biblioteca" itens={0} nota="privadas da sua conta" />
      <div className="mx-6 mt-6 border border-dashed border-ink-850 p-8">
        <h3 className="titulo-estampado text-sm text-label-100">Sua estante está vazia</h3>
        <p className="mt-1 max-w-prose text-sm leading-relaxed text-ink-500">
          As ROMs que você enviar ficam aqui, privadas da sua conta. Ninguém mais as baixa.
        </p>
        <Link
          to="/enviar-rom"
          className="mt-4 inline-block border border-ink-700 px-3 py-1 text-xs text-label-200 outline-none hover:border-label-400 hover:text-label-100 focus-visible:border-label-400"
        >
          Enviar uma ROM
        </Link>
      </div>
    </Secao>
  );
}

/**
 * Um cartucho da estante pessoal, com as duas ações que ele aceita.
 *
 * O `tabIndex` no grupo não é enfeite de acessibilidade: a etiqueta (e os
 * botões dentro dela) só aparece com o cartucho aberto, e quem navega por
 * teclado precisa de um jeito de abri-lo. Focar o cartucho abre; a partir daí
 * o `group-focus-within` do `Cartucho` mantém a etiqueta aberta enquanto o
 * foco estiver em algum botão de dentro.
 *
 * O `role="group"` com `aria-label` é o que dá contexto aos botões: eles se
 * chamam "Favoritar" e "Remover" e nada mais, porque quem os alcança já
 * entrou no grupo daquele cartucho e ouviu o nome dele. Repetir o título em
 * cada `aria-label` seria dizer o mesmo duas vezes seguidas.
 */
function NaEstante({
  rom,
  aoRemover,
}: {
  readonly rom: LibraryRom;
  readonly aoRemover: () => void;
}) {
  const favoritar = useFavoritarRom();

  return (
    <div
      className="group relative rounded-[2px] outline-none focus-visible:ring-1 focus-visible:ring-label-400"
      tabIndex={0}
      role="group"
      aria-label={`${rom.title} — ${rom.fileName}`}
    >
      <Cartucho
        titulo={rom.title}
        systemId={rom.systemId}
        selo={emBytesLegiveis(rom.sizeBytes)}
        capaUrl={rom.coverUrl}
        favorito={rom.isFavorite}
        rodape={
          // Empilhados, e não lado a lado: "Desfavoritar" não cabe em meia
          // etiqueta sem virar abreviação, e abreviar o rótulo de um botão que
          // já é pequeno é pedir para a pessoa adivinhar o que ele faz.
          <div className="flex flex-col gap-1">
            <BotaoDaEtiqueta
              rotulo={rom.isFavorite ? 'Desfavoritar' : 'Favoritar'}
              ocupado={favoritar.isPending}
              aoClicar={() => {
                favoritar.mutate({ romId: rom.id, favorito: !rom.isFavorite });
              }}
            />
            <BotaoDaEtiqueta rotulo="Remover" perigo aoClicar={aoRemover} />
          </div>
        }
      />
    </div>
  );
}

/**
 * Botão do tamanho de uma etiqueta de cartucho.
 *
 * Fundo claro e texto escuro porque ele vive **sobre o papel** da etiqueta, e
 * não sobre a tinta do fundo — é o único lugar do produto onde a hierarquia se
 * inverte. O de remover ganha a cor de alerta, que existe para isso e não é
 * nenhuma das quatro cores dos slots de save (docs/design.md).
 */
function BotaoDaEtiqueta({
  rotulo,
  aoClicar,
  ocupado = false,
  perigo = false,
}: {
  readonly rotulo: string;
  readonly aoClicar: () => void;
  readonly ocupado?: boolean;
  readonly perigo?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={ocupado}
      onClick={aoClicar}
      className={`w-full border px-1 py-0.5 text-[0.6rem] uppercase tracking-wide outline-none transition-colors disabled:opacity-50 ${
        perigo
          ? 'border-alert/60 text-alert hover:bg-alert hover:text-label-100 focus-visible:bg-alert focus-visible:text-label-100'
          : 'border-ink-800/40 text-ink-800 hover:bg-ink-850 hover:text-label-100 focus-visible:bg-ink-850 focus-visible:text-label-100'
      }`}
    >
      {rotulo}
    </button>
  );
}
