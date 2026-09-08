import {
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from '@tanstack/react-query';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  authenticatedUserResponseSchema,
  forgotPasswordResponseSchema,
  logoutResponseSchema,
  registerResponseSchema,
  resetPasswordResponseSchema,
  type AuthenticatedUser,
  type ForgotPasswordRequest,
  type LoginRequest,
  type RegisterRequest,
  type ResetPasswordRequest,
} from '@pixelvault/contracts';
import { ApiRequestError, apiFetch } from '../../lib/api.js';
import { CHAVE_DAS_HABILIDADES } from './habilidades.js';

/**
 * Quem está logado, do ponto de vista do front.
 *
 * Três estados, e não dois: enquanto `GET /api/auth/me` não respondeu, a
 * resposta honesta é "ainda não sei". Colapsar isso em "anônimo" é o que faz
 * o cabeçalho piscar deslogado a cada F5 — a interface afirma por um quadro
 * uma coisa que ela não sabe, e desafirma no quadro seguinte. Quem consome
 * este estado tem que ter um desenho para `carregando`; é o preço, e é
 * barato perto do salto.
 */
export type Sessao =
  | { readonly estado: 'carregando' }
  | { readonly estado: 'anonimo' }
  | { readonly estado: 'autenticado'; readonly usuario: AuthenticatedUser };

/**
 * A consulta que responde "quem está logado", em `queryOptions` e não solta
 * dentro de um hook: assim o roteador (`beforeLoad`, sem React) e o
 * cabeçalho (com React) fazem a MESMA pergunta, com a mesma chave, e
 * compartilham a mesma resposta em cache.
 *
 * `null` é resposta, não falha — ver `buscarQuemEstaLogado`. `retry: false`
 * porque a única falha esperada aqui já virou `null`; insistir só atrasaria
 * a saída do estado `carregando`, que é justamente o que não pode demorar.
 */
export const opcoesDaConsultaDeSessao = queryOptions({
  queryKey: ['sessao'],
  queryFn: buscarQuemEstaLogado,
  retry: false,
});

async function buscarQuemEstaLogado(): Promise<AuthenticatedUser | null> {
  try {
    const { user } = await apiFetch('/api/auth/me', authenticatedUserResponseSchema);
    return user;
  } catch (erro) {
    // 401 aqui não é erro: é a resposta "não tem ninguém logado". Deixá-lo
    // subir como exceção transformaria o estado mais comum do produto — o
    // visitante — num erro a ser tratado em cada tela.
    if (erro instanceof ApiRequestError && erro.status === 401) return null;
    throw erro;
  }
}

const ContextoDeSessao = createContext<Sessao | null>(null);

/**
 * O contexto de autenticação.
 *
 * Ele não guarda estado próprio: deriva os três estados da consulta acima.
 * A razão de existir mesmo assim é ter UM lugar onde essa derivação
 * acontece — sem ele, cada tela repetiria o `isPending ? … : data ?? …` e
 * uma delas acabaria escrevendo a versão de dois estados.
 *
 * Fica acima do roteador (`main.tsx`) porque o cabeçalho, que é do
 * roteador, precisa dele.
 */
export function ProvedorDeSessao({ children }: { readonly children: ReactNode }) {
  const consulta = useQuery(opcoesDaConsultaDeSessao);

  const sessao = useMemo<Sessao>(() => {
    if (consulta.isPending) return { estado: 'carregando' };
    // Falha de rede cai em `anonimo` de propósito: sem resposta do servidor
    // não há sessão que se possa provar, e travar a interface em
    // "carregando" para sempre seria pior — a API fora do ar não pode
    // impedir alguém de jogar homebrew, que não precisa de conta nenhuma.
    const usuario = consulta.data ?? null;
    return usuario === null ? { estado: 'anonimo' } : { estado: 'autenticado', usuario };
  }, [consulta.isPending, consulta.data]);

  return <ContextoDeSessao.Provider value={sessao}>{children}</ContextoDeSessao.Provider>;
}

export function useSessao(): Sessao {
  const sessao = useContext(ContextoDeSessao);
  if (sessao === null) throw new Error('useSessao precisa estar dentro de <ProvedorDeSessao>');
  return sessao;
}

/**
 * Entrar. Em caso de sucesso o cookie de sessão já veio na resposta; o que
 * resta é o cache do front concordar com isso.
 */
export function useEntrar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (credenciais: LoginRequest) => autenticar(credenciais),
    onSuccess: async (usuario) => {
      await passouASerOutraPessoa(queryClient, usuario);
    },
  });
}

/** O resultado do cadastro, do ponto de vista de quem preencheu a ficha. */
export type ResultadoDoCadastro =
  /** Conta criada e sessão aberta: a pessoa já está dentro. */
  | { readonly entrou: true }
  /**
   * O cadastro foi aceito mas a entrada automática não passou. Só há um
   * caminho para isso: o e-mail já tinha conta, com outra senha. O servidor
   * responde igual para cadastro novo e e-mail repetido de propósito (ver
   * `registerResponseSchema`), então o front não tem — nem quer ter — como
   * afirmar qual dos dois foi.
   */
  | { readonly entrou: false };

/**
 * Cadastrar e entrar, na mesma ação.
 *
 * São duas requisições porque o cadastro não abre sessão: ele responde 202
 * "cadastro-recebido", idêntico para conta criada e para e-mail já
 * cadastrado, e um corpo que abrisse sessão só no primeiro caso entregaria a
 * diferença. Quem tenta entrar em seguida é o front, com as credenciais que
 * a própria pessoa acabou de digitar.
 */
export function useCadastrar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (dados: RegisterRequest): Promise<ResultadoDoCadastro> => {
      await apiFetch('/api/auth/register', registerResponseSchema, {
        method: 'POST',
        body: JSON.stringify(dados),
      });

      try {
        const usuario = await autenticar({ email: dados.email, password: dados.password });
        await passouASerOutraPessoa(queryClient, usuario);
        return { entrou: true };
      } catch (erro) {
        if (erro instanceof ApiRequestError && erro.status === 401) return { entrou: false };
        throw erro;
      }
    },
  });
}

/** Sair. */
export function useSair() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      // Sem corpo: o logout não lê nada da requisição, e o `apiFetch` só
      // anuncia `content-type: application/json` quando há o que anunciar.
      apiFetch('/api/auth/logout', logoutResponseSchema, { method: 'POST' }),
    onSuccess: async () => {
      await passouASerOutraPessoa(queryClient, null);
    },
  });
}

/**
 * Pedir o link de redefinição.
 *
 * Sem `onSuccess` que mexa no cache: nada mudou para quem está do lado de cá
 * da tela. E sem tratamento diferente para "e-mail não cadastrado", porque a
 * API não diz — ela responde 202 nos dois casos, de propósito.
 */
export function useSolicitarRecuperacao() {
  return useMutation({
    mutationFn: (dados: ForgotPasswordRequest) =>
      apiFetch('/api/auth/forgot-password', forgotPasswordResponseSchema, {
        method: 'POST',
        body: JSON.stringify(dados),
      }),
  });
}

/**
 * Redefinir a senha com o token do e-mail.
 *
 * A redefinição derruba TODAS as sessões da conta, inclusive uma que este
 * navegador por acaso tivesse — daí o `passouASerOutraPessoa(null)` no
 * sucesso: o cookie que sobrou aqui já não abre nada, e deixar o cache
 * afirmando que alguém está logado desenharia um cabeçalho que mente até o
 * próximo F5.
 */
export function useRedefinirSenha() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (dados: ResetPasswordRequest) =>
      apiFetch('/api/auth/reset-password', resetPasswordResponseSchema, {
        method: 'POST',
        body: JSON.stringify(dados),
      }),
    onSuccess: async () => {
      await passouASerOutraPessoa(queryClient, null);
    },
  });
}

function autenticar(credenciais: LoginRequest): Promise<AuthenticatedUser> {
  return apiFetch('/api/auth/login', authenticatedUserResponseSchema, {
    method: 'POST',
    body: JSON.stringify(credenciais),
  }).then(({ user }) => user);
}

/**
 * O cache depois de trocar quem está do outro lado da tela.
 *
 * `setQueryData` e não `invalidateQueries` para a sessão: a resposta do
 * login JÁ é o usuário, e refazer `/me` só para confirmar deixaria a
 * interface um instante em "carregando" logo depois de entrar.
 *
 * As habilidades, essas, precisam ser refeitas: elas são calculadas para
 * quem está pedindo, e as do visitante não são as de ninguém logado. É por
 * isso que `useHabilidades` continua um hook à parte e não foi absorvido
 * aqui — ele responde a uma pergunta diferente ("o que pode"), vale também
 * para quem não tem conta, e o único vínculo real entre os dois é este:
 * mudou quem está logado, mudou o que pode.
 */
async function passouASerOutraPessoa(
  queryClient: QueryClient,
  usuario: AuthenticatedUser | null,
): Promise<void> {
  queryClient.setQueryData(opcoesDaConsultaDeSessao.queryKey, usuario);
  await queryClient.invalidateQueries({ queryKey: CHAVE_DAS_HABILIDADES });
}
