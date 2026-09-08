import { Link } from '@tanstack/react-router';
import { useSessao } from './sessao.js';

/**
 * A ficha da própria conta — e a única rota protegida que existe hoje.
 *
 * Ela é deliberadamente curta: acervo pessoal e progresso são M3 e M4, e
 * inventar aqui um painel de coisas que ainda não existem seria desenhar
 * promessa. O que está nesta tela é o que o servidor já sabe responder sobre
 * a pessoa.
 *
 * O estado `carregando` não é tratado aqui porque não chega até aqui: quem
 * decide é o `beforeLoad` da rota, que espera `/api/auth/me` antes de
 * renderizar qualquer coisa. Ver `rota-protegida.ts`.
 */
export function ConfiguracoesPage() {
  const sessao = useSessao();

  if (sessao.estado !== 'autenticado') return null;
  const { usuario } = sessao;

  return (
    <div className="mx-auto max-w-2xl px-6">
      <Link
        to="/"
        className="leitura text-ink-700 outline-none hover:text-ink-500 focus-visible:underline"
      >
        ← acervo
      </Link>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b-2 border-ink-850 pb-2">
        <h1 className="titulo-estampado text-2xl leading-none text-label-100">Sua conta</h1>
        <span className="leitura text-ink-700">@{usuario.handle}</span>
      </div>

      <dl className="mt-5 flex flex-wrap gap-x-10 gap-y-4">
        <Verbete rotulo="como aparece" valor={usuario.displayName} />
        <Verbete rotulo="e-mail" valor={usuario.email} />
        <Verbete rotulo="nº de conta" valor={usuario.id} maquina />
      </dl>

      <p className="mt-8 max-w-md text-xs leading-relaxed text-ink-700">
        Sua sessão vive num cookie que o JavaScript desta página não lê. Trocar de senha e ver onde
        você está logado chegam junto com o acervo pessoal.
      </p>
    </div>
  );
}

function Verbete({
  rotulo,
  valor,
  maquina = false,
}: {
  readonly rotulo: string;
  readonly valor: string;
  readonly maquina?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="leitura text-ink-700">{rotulo}</dt>
      <dd
        className={maquina ? 'leitura truncate text-label-200' : 'truncate text-sm text-label-100'}
      >
        {valor}
      </dd>
    </div>
  );
}
