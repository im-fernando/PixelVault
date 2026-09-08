import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { registerRequestSchema } from '@pixelvault/contracts';
import { BotaoPrincipal, Caixa, Campo, Ficha, Recusa } from './Ficha.js';
import {
  deErroDeApi,
  deErroDeContrato,
  REGRA_DO_CAMPO,
  SEM_ERRO,
  type ErroDeFormulario,
} from './erros.js';
import { useCadastrar } from './sessao.js';

const CAMPOS = ['email', 'handle', 'password', 'displayName', 'termsAccepted'] as const;

/**
 * A ficha de inscrição no acervo.
 *
 * O handle aparece com destaque, e não escondido atrás de "opcional", porque
 * ele é o nome público da pessoa aqui (`/u/:handle`, na M6) e é o único
 * campo que o servidor recusa com honestidade quando já está tomado — os
 * outros ele aceita em silêncio, para não virar uma lista de quem tem conta.
 */
export function CadastroPage({ retorno }: { readonly retorno: string | undefined }) {
  const navegar = useNavigate();
  const cadastrar = useCadastrar();
  const [erro, setErro] = useState<ErroDeFormulario>(SEM_ERRO);
  const [emailJaTinhaConta, setEmailJaTinhaConta] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);
    const displayName = String(dados.get('displayName') ?? '').trim();

    // Validado com o MESMO schema da API: o que passa aqui é exatamente o
    // que passa lá, e a recusa por formato aparece sem uma ida à rede.
    const cadastro = registerRequestSchema.safeParse({
      email: String(dados.get('email') ?? '').trim(),
      handle: String(dados.get('handle') ?? '')
        .trim()
        .toLowerCase(),
      password: String(dados.get('password') ?? ''),
      termsAccepted: dados.get('termsAccepted') === 'on',
      ...(displayName === '' ? {} : { displayName }),
    });
    if (!cadastro.success) {
      setEmailJaTinhaConta(false);
      setErro(deErroDeContrato(cadastro.error));
      return;
    }

    try {
      const resultado = await cadastrar.mutateAsync(cadastro.data);
      setErro(SEM_ERRO);

      if (!resultado.entrou) {
        setEmailJaTinhaConta(true);
        return;
      }

      await navegar({ to: retorno ?? '/', replace: true });
    } catch (falha) {
      setEmailJaTinhaConta(false);
      setErro(deErroDeApi(falha, CAMPOS));
    }
  }

  return (
    <Ficha
      titulo="Criar conta"
      nota="Cartucho guarda o save numa pilha, e pilha acaba. Com conta, o progresso fica onde você deixou — em qualquer aparelho."
    >
      <form onSubmit={aoEnviar} noValidate>
        {erro.geral !== null && <Recusa>{erro.geral}</Recusa>}

        {emailJaTinhaConta && (
          <Recusa>
            Cadastro recebido, mas não deu para entrar com essa senha. Se este e-mail já tem conta,{' '}
            <Link to="/login" search={{ retorno }} className="underline underline-offset-4">
              entre com a senha dela
            </Link>
            .
          </Recusa>
        )}

        <Campo
          name="email"
          type="email"
          rotulo="E-mail"
          autoComplete="email"
          autoFocus
          required
          ajuda={REGRA_DO_CAMPO['email']}
          erro={erro.porCampo['email']}
        />
        <Campo
          name="handle"
          type="text"
          rotulo="Nome de usuário"
          autoComplete="username"
          required
          placeholder="fulano-de-tal"
          ajuda={REGRA_DO_CAMPO['handle']}
          erro={erro.porCampo['handle']}
        />
        <Campo
          name="displayName"
          type="text"
          rotulo="Como aparecer (opcional)"
          autoComplete="nickname"
          ajuda={REGRA_DO_CAMPO['displayName']}
          erro={erro.porCampo['displayName']}
        />
        <Campo
          name="password"
          type="password"
          rotulo="Senha"
          autoComplete="new-password"
          required
          ajuda={REGRA_DO_CAMPO['password']}
          erro={erro.porCampo['password']}
        />

        <Caixa name="termsAccepted" erro={erro.porCampo['termsAccepted']}>
          Li e aceito os termos de uso. As ROMs que eu enviar são minhas e só minhas — ninguém mais
          as baixa.
        </Caixa>

        <BotaoPrincipal ocupado={cadastrar.isPending}>
          {cadastrar.isPending ? 'Criando…' : 'Criar conta'}
        </BotaoPrincipal>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        Já tem conta?{' '}
        <Link
          to="/login"
          search={{ retorno }}
          className="text-label-200 underline underline-offset-4 hover:text-label-100"
        >
          Entrar
        </Link>
        .
      </p>
    </Ficha>
  );
}
