import {
  useId,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { Arte } from '../../ui/Arte.js';
import { useGames } from '../library/use-games.js';

/**
 * As peças de formulário da autenticação, no desenho do console.
 *
 * Entrar e se cadastrar acontecem num painel de vidro à direita; à esquerda,
 * a mesma cena que a pessoa vai encontrar do outro lado — três caixas do
 * catálogo em leque e a promessa do produto em uma frase. Não é herói com
 * manchete vaga: as caixas são jogos de verdade, lidos do catálogo público,
 * e quem chega sem conta vê o que vai poder jogar antes mesmo de entrar.
 */

export function Ficha({
  titulo,
  nota,
  children,
}: {
  readonly titulo: string;
  readonly nota: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="mx-auto grid max-w-[1120px] items-center gap-12 py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)]">
      <Cena />
      <section className="pv-painel px-7 py-8 sm:px-9 sm:py-10">
        <p className="sobrelinha">PixelVault · sua conta</p>
        <h1 className="titulo-cena mt-3 text-[clamp(30px,3.4vw,42px)] text-label-100">{titulo}</h1>
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-500">{nota}</p>
        {children}
      </section>
    </div>
  );
}

/** As três caixas em leque e a frase — a vitrine vista de fora. */
function Cena() {
  const { data: games } = useGames();
  const caixas = (games ?? [])
    .filter((game) => game.coverUrl !== null)
    .slice(0, 3)
    .map((game, indice) => ({ game, desvio: indice - 1 }));

  return (
    <aside className="hidden lg:block" aria-hidden="true">
      <p className="sobrelinha">Super Nintendo · no navegador</p>
      <h2 className="titulo-cena mt-4 max-w-[520px] text-[clamp(34px,3.8vw,58px)] text-label-100">
        Seu acervo. Seu progresso. <span className="text-label-400">Em qualquer tela.</span>
      </h2>
      <p className="mt-4 max-w-md text-[14px] leading-relaxed text-ink-500">
        Cartucho guarda o save numa pilha, e pilha acaba. Aqui o save fica na conta, e a ROM que
        você envia é sua e só sua.
      </p>
      {caixas.length > 0 && (
        <div className="pv-leque mt-6 min-h-[340px]">
          <div className="pv-orbita" />
          {caixas.map(({ game, desvio }) => (
            <div
              key={game.id}
              className="pv-caixa"
              style={{ '--desvio': desvio, '--distancia': Math.abs(desvio) } as CSSProperties}
            >
              <Arte titulo={game.title} sistema={game.systemId} capaUrl={game.coverUrl} />
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

interface PropsDoCampo extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className'> {
  readonly rotulo: string;
  /** A regra do campo, dita antes de a pessoa errar. */
  readonly ajuda?: string | undefined;
  readonly erro?: string | undefined;
}

export function Campo({ rotulo, ajuda, erro, ...props }: PropsDoCampo) {
  const id = useId();
  const idDaAjuda = `${id}-ajuda`;

  return (
    <div className="mt-5">
      <label htmlFor={id} className="pv-rotulo">
        {rotulo}
      </label>
      <input
        {...props}
        id={id}
        aria-invalid={erro === undefined ? undefined : true}
        aria-describedby={erro === undefined && ajuda === undefined ? undefined : idDaAjuda}
        className="pv-campo"
      />
      {(erro ?? ajuda) !== undefined && (
        <p id={idDaAjuda} className={`pv-ajuda ${erro === undefined ? '' : 'pv-ajuda--erro'}`}>
          {erro ?? ajuda}
        </p>
      )}
    </div>
  );
}

export function Caixa({
  erro,
  children,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'className' | 'type'> & {
  readonly erro?: string | undefined;
  readonly children: ReactNode;
}) {
  const id = useId();

  return (
    <div className="mt-6">
      <div className="flex items-start gap-3">
        <input {...props} id={id} type="checkbox" className="pv-marcador" />
        <label htmlFor={id} className="text-[12.5px] leading-relaxed text-ink-500">
          {children}
        </label>
      </div>
      {erro !== undefined && <p className="pv-ajuda pv-ajuda--erro">{erro}</p>}
    </div>
  );
}

/**
 * O erro que não é de campo nenhum.
 *
 * Mesma forma do "O acervo não respondeu" da estante: barra de atenção à
 * esquerda, sem ícone e sem pedido de desculpas. É aqui que cai a recusa de
 * credencial do login, com a mensagem que o servidor mandou — e só ela.
 */
export function Recusa({ children }: { readonly children: ReactNode }) {
  return (
    <p role="alert" className="pv-aviso mt-6 text-[13.5px] leading-relaxed text-label-100">
      {children}
    </p>
  );
}

export function BotaoPrincipal({
  children,
  ocupado,
  ...props
}: {
  readonly children: ReactNode;
  readonly ocupado: boolean;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'className' | 'type' | 'disabled'>) {
  return (
    <button
      {...props}
      type="submit"
      disabled={ocupado}
      className="pv-pilula pv-pilula--larga mt-7 disabled:cursor-progress"
    >
      {children}
    </button>
  );
}
