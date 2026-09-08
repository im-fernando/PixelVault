import { Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { loginRequestSchema } from '@pixelvault/contracts';
import { BotaoPrincipal, Campo, Ficha, Recusa } from './Ficha.js';
import { deErroDeApi, deErroDeContrato, SEM_ERRO, type ErroDeFormulario } from './erros.js';
import { useEntrar } from './sessao.js';

const CAMPOS = ['email', 'password'] as const;

/**
 * Entrar.
 *
 * O formulário não tem nada a dizer sobre qual dos dois campos falhou, e é
 * assim de propósito: o servidor devolve um código só para "e-mail não
 * existe" e "senha errada" (`CREDENCIAIS_INVALIDAS`, sob a chave
 * `credentials`, que não é campo deste formulário), então a recusa cai
 * inteira no aviso do topo, com a mensagem que veio de lá. Inventar aqui um
 * "e-mail não encontrado" desfaria, numa linha de front, o cuidado que a API
 * inteira toma para não servir de lista de quem tem conta.
 */
export function LoginPage({ retorno }: { readonly retorno: string | undefined }) {
  const navegar = useNavigate();
  const entrar = useEntrar();
  const [erro, setErro] = useState<ErroDeFormulario>(SEM_ERRO);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    const credenciais = loginRequestSchema.safeParse({
      email: String(dados.get('email') ?? '').trim(),
      password: String(dados.get('password') ?? ''),
    });
    if (!credenciais.success) {
      setErro(deErroDeContrato(credenciais.error));
      return;
    }

    try {
      await entrar.mutateAsync(credenciais.data);
      setErro(SEM_ERRO);
      // `replace`: o histórico não deve guardar a tela de login de alguém
      // que já entrou — voltar para ela seria voltar para lugar nenhum.
      await navegar({ to: retorno ?? '/', replace: true });
    } catch (falha) {
      setErro(deErroDeApi(falha, CAMPOS));
    }
  }

  return (
    <Ficha titulo="Entrar" nota="Seu acervo e seus saves esperam do outro lado.">
      <form onSubmit={aoEnviar} noValidate>
        {erro.geral !== null && <Recusa>{erro.geral}</Recusa>}

        <Campo
          name="email"
          type="email"
          rotulo="E-mail"
          autoComplete="email"
          autoFocus
          required
          erro={erro.porCampo['email']}
        />
        <Campo
          name="password"
          type="password"
          rotulo="Senha"
          autoComplete="current-password"
          required
          erro={erro.porCampo['password']}
        />

        <BotaoPrincipal ocupado={entrar.isPending}>
          {entrar.isPending ? 'Entrando…' : 'Entrar'}
        </BotaoPrincipal>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        Ainda não tem conta?{' '}
        <Link
          to="/cadastro"
          search={{ retorno }}
          className="text-label-200 underline underline-offset-4 hover:text-label-100"
        >
          Criar uma
        </Link>
        .
      </p>
    </Ficha>
  );
}
