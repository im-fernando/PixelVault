import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { recurso, useHabilidades } from './habilidades.js';
import { useSair, useSessao } from './sessao.js';

/**
 * Quem está logado, no canto do cabeçalho.
 *
 * Os três estados da sessão aparecem inteiros aqui, e é aqui que a diferença
 * entre "carregando" e "anônimo" se vê: enquanto `/api/auth/me` não
 * respondeu, o espaço fica reservado e vazio, do tamanho certo. Desenhar
 * "Entrar" nesse intervalo faria a página piscar deslogada a cada F5 de quem
 * está logado — que é exatamente o defeito que esta issue existe para não
 * ter.
 */
export function ContaNoCabecalho() {
  const sessao = useSessao();
  const { habilidades, carregando: habilidadesCarregando } = useHabilidades();
  const sair = useSair();
  const navegar = useNavigate();
  const caminhoAtual = useRouterState({ select: (estado) => estado.location.href });

  if (sessao.estado === 'carregando' || habilidadesCarregando) return <Reservado />;

  if (sessao.estado === 'anonimo') {
    return (
      <div className="ml-auto flex items-center gap-4 text-sm">
        <Link
          to="/login"
          search={{ retorno: ehTelaDeAutenticacao(caminhoAtual) ? undefined : caminhoAtual }}
          className="text-ink-500 outline-none hover:text-label-100 focus-visible:underline"
        >
          Entrar
        </Link>
        <Link
          to="/cadastro"
          className="border border-ink-700 px-3 py-1 text-xs text-label-200 outline-none hover:border-label-400 hover:text-label-100 focus-visible:border-label-400"
        >
          Criar conta
        </Link>
      </div>
    );
  }

  const { usuario } = sessao;
  // A única coisa que o CASL esconde hoje, e de propósito: o produto ainda
  // não tem ação que uma pessoa logada possa fazer e outra não. Perguntar
  // pelo recurso concreto (`Profile` com o `userId` dela) e não pelo nome do
  // tipo é o que faz a pergunta valer alguma coisa — ver `habilidades.ts`.
  const podeVerAConta = habilidades.can('read', recurso('Profile', { userId: usuario.id }));

  async function aoSair(): Promise<void> {
    await sair.mutateAsync();
    // Sair de uma tela que só existe para quem entrou não pode deixar a
    // pessoa parada nela esperando o redirecionamento do roteador.
    await navegar({ to: '/', replace: true });
  }

  return (
    <div className="ml-auto flex items-center gap-4">
      {podeVerAConta ? (
        <Link
          to="/configuracoes"
          className="max-w-40 truncate text-sm text-label-200 outline-none hover:text-label-100 focus-visible:underline"
          title={`Entrou como @${usuario.handle}`}
        >
          {usuario.displayName}
        </Link>
      ) : (
        <span className="max-w-40 truncate text-sm text-label-200">{usuario.displayName}</span>
      )}
      <button
        type="button"
        onClick={() => void aoSair()}
        disabled={sair.isPending}
        className="text-xs text-ink-500 outline-none hover:text-alert focus-visible:underline disabled:opacity-50"
      >
        {sair.isPending ? 'Saindo…' : 'Sair'}
      </button>
    </div>
  );
}

/**
 * O espaço do bloco de conta enquanto ainda não se sabe quem está lá.
 *
 * Vazio e não um esqueleto pulsante: o intervalo costuma durar um piscar de
 * olhos, e uma animação nesse tempo chama mais atenção que o próprio
 * conteúdo. O que ele garante é a largura — o cabeçalho não se remonta
 * quando a resposta chega.
 */
function Reservado() {
  return <div aria-hidden className="ml-auto h-6 w-32" />;
}

/**
 * Não faz sentido voltar para a tela de login depois de logar.
 */
function ehTelaDeAutenticacao(caminho: string): boolean {
  return caminho.startsWith('/login') || caminho.startsWith('/cadastro');
}
