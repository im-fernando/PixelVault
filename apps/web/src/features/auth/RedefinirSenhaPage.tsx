import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { resetPasswordRequestSchema } from '@pixelvault/contracts';
import { BotaoPrincipal, Campo, Ficha, Recusa } from './Ficha.js';
import {
  deErroDeApi,
  deErroDeContrato,
  REGRA_DO_CAMPO,
  SEM_ERRO,
  type ErroDeFormulario,
} from './erros.js';
import { useRedefinirSenha } from './sessao.js';

const CAMPOS = ['password', 'token'] as const;

/**
 * Escolher a senha nova, com o token que veio no link do e-mail.
 *
 * O token fica só na URL e no corpo da requisição — não vira campo visível,
 * não vira estado que outra tela leia, não vai para o cache. Ele é a prova de
 * identidade deste fluxo inteiro, e quanto menos lugares o guardarem, menos
 * lugares podem vazá-lo.
 *
 * Link sem token cai na mesma tela, com a mesma recusa que um token gasto
 * produziria. É de propósito: a pessoa que chegou aqui de qualquer jeito
 * errado precisa de uma instrução só — peça outro link.
 */
export function RedefinirSenhaPage({ token }: { readonly token: string | undefined }) {
  const redefinir = useRedefinirSenha();
  const [erro, setErro] = useState<ErroDeFormulario>(SEM_ERRO);
  const [redefinida, setRedefinida] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    const redefinicao = resetPasswordRequestSchema.safeParse({
      token: token ?? '',
      password: String(dados.get('password') ?? ''),
    });
    if (!redefinicao.success) {
      setErro(deErroDeContrato(redefinicao.error));
      return;
    }

    try {
      await redefinir.mutateAsync(redefinicao.data);
      setErro(SEM_ERRO);
      setRedefinida(true);
    } catch (falha) {
      setErro(deErroDeApi(falha, CAMPOS));
    }
  }

  if (redefinida) {
    return (
      <Ficha
        titulo="Senha trocada"
        nota="Todas as sessões da conta foram encerradas — inclusive a de quem quer que estivesse dentro. Entre de novo com a senha nova."
      >
        <p className="mt-6 text-xs text-ink-500">
          <Link
            to="/login"
            replace
            className="text-label-200 underline underline-offset-4 hover:text-label-100"
          >
            Entrar com a senha nova
          </Link>
          .
        </p>
      </Ficha>
    );
  }

  return (
    <Ficha
      titulo="Nova senha"
      nota="Escolha a senha que vai valer daqui em diante. Trocar a senha encerra todas as sessões abertas da conta."
    >
      <form onSubmit={aoEnviar} noValidate>
        {erro.geral !== null && <Recusa>{erro.geral}</Recusa>}
        {erro.porCampo['token'] !== undefined && (
          <Recusa>
            {erro.porCampo['token']}{' '}
            <Link to="/recuperar-senha" className="underline underline-offset-4">
              Pedir um link novo
            </Link>
            .
          </Recusa>
        )}

        <Campo
          name="password"
          type="password"
          rotulo="Nova senha"
          autoComplete="new-password"
          autoFocus
          required
          ajuda={REGRA_DO_CAMPO['password']}
          erro={erro.porCampo['password']}
        />

        <BotaoPrincipal ocupado={redefinir.isPending}>
          {redefinir.isPending ? 'Trocando…' : 'Trocar a senha'}
        </BotaoPrincipal>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        Lembrou da antiga?{' '}
        <Link
          to="/login"
          className="text-label-200 underline underline-offset-4 hover:text-label-100"
        >
          Entrar
        </Link>
        .
      </p>
    </Ficha>
  );
}
