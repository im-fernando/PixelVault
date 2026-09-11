import { Link, useNavigate, useRouterState } from '@tanstack/react-router';
import { classesDaPilula } from '../../ui/Botao.js';
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
      <div className="flex items-center gap-3">
        <Link
          to="/login"
          search={{ retorno: ehTelaDeAutenticacao(caminhoAtual) ? undefined : caminhoAtual }}
          className="px-2 py-1 text-[14px] text-ink-500 outline-none hover:text-label-100 focus-visible:underline"
        >
          Entrar
        </Link>
        <Link to="/cadastro" className={classesDaPilula({ pequena: true })}>
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

  const inicial = usuario.displayName.trim().charAt(0).toUpperCase() || '?';
  const conta = (
    <>
      <span
        aria-hidden="true"
        className="grid h-7 w-7 place-items-center rounded-full bg-luz font-display text-[12px] font-bold text-ink-950"
      >
        {inicial}
      </span>
      <b className="max-w-36 truncate">{usuario.displayName}</b>
    </>
  );

  return (
    <div className="flex items-center gap-3">
      {podeVerAConta ? (
        <Link
          to="/configuracoes"
          className="pv-chip h-9 gap-2.5 pl-1 pr-3 outline-none transition-colors hover:border-label-400 focus-visible:border-luz"
          title={`Entrou como @${usuario.handle}`}
        >
          {conta}
        </Link>
      ) : (
        <span className="pv-chip h-9 gap-2.5 pl-1 pr-3">{conta}</span>
      )}
      <button
        type="button"
        onClick={() => void aoSair()}
        disabled={sair.isPending}
        className="px-1 text-[12px] text-ink-500 outline-none hover:text-alert focus-visible:underline disabled:opacity-50"
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
  return <div aria-hidden className="h-9 w-40" />;
}

/**
 * Não faz sentido voltar para a tela de login depois de logar.
 */
function ehTelaDeAutenticacao(caminho: string): boolean {
  return caminho.startsWith('/login') || caminho.startsWith('/cadastro');
}
