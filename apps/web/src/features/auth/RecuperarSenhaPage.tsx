import { Link } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import {
  forgotPasswordRequestSchema,
  VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS,
} from '@pixelvault/contracts';
import { BotaoPrincipal, Campo, Ficha, Recusa } from './Ficha.js';
import { deErroDeApi, deErroDeContrato, SEM_ERRO, type ErroDeFormulario } from './erros.js';
import { useSolicitarRecuperacao } from './sessao.js';

const CAMPOS = ['email'] as const;

const MINUTOS = Math.round(VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS / 60_000);

/**
 * Pedir o link de redefinição.
 *
 * A tela de sucesso não diz "enviamos um e-mail para você": diz que **se**
 * houver conta, o link está a caminho. A diferença não é preciosismo de
 * texto — é a mesma anti-enumeração que a API sustenta do outro lado. Uma
 * tela que afirmasse o envio entregaria, em português claro, a informação
 * que o servidor se recusa a dar no status, no corpo e no relógio.
 *
 * É por isso também que a confirmação substitui o formulário em vez de
 * aparecer em cima dele: sem campo para reenviar, ninguém fica comparando o
 * que a tela responde para um e-mail e para outro.
 */
export function RecuperarSenhaPage() {
  const solicitar = useSolicitarRecuperacao();
  const [erro, setErro] = useState<ErroDeFormulario>(SEM_ERRO);
  const [pedido, setPedido] = useState(false);

  async function aoEnviar(evento: FormEvent<HTMLFormElement>): Promise<void> {
    evento.preventDefault();
    const dados = new FormData(evento.currentTarget);

    const pedidoDeRecuperacao = forgotPasswordRequestSchema.safeParse({
      email: String(dados.get('email') ?? '').trim(),
    });
    if (!pedidoDeRecuperacao.success) {
      setErro(deErroDeContrato(pedidoDeRecuperacao.error));
      return;
    }

    try {
      await solicitar.mutateAsync(pedidoDeRecuperacao.data);
      setErro(SEM_ERRO);
      setPedido(true);
    } catch (falha) {
      setErro(deErroDeApi(falha, CAMPOS));
    }
  }

  if (pedido) {
    return (
      <Ficha
        titulo="Confira seu e-mail"
        nota={`Se existir conta com esse endereço, o link de redefinição já está a caminho. Ele vale por ${MINUTOS} minutos e funciona uma vez só.`}
      >
        <p className="mt-6 text-xs leading-relaxed text-ink-500">
          Não chegou? Veja no spam antes de pedir de novo — cada pedido manda uma mensagem, e
          pedidos demais para o mesmo endereço ficam de castigo por um tempo.
        </p>
        <p className="mt-6 text-xs text-ink-500">
          <Link
            to="/login"
            className="text-label-200 underline underline-offset-4 hover:text-label-100"
          >
            Voltar para a entrada
          </Link>
          .
        </p>
      </Ficha>
    );
  }

  return (
    <Ficha
      titulo="Esqueci minha senha"
      nota="Diga o e-mail da conta e mandamos um link para escolher uma senha nova."
    >
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

        <BotaoPrincipal ocupado={solicitar.isPending}>
          {solicitar.isPending ? 'Enviando…' : 'Mandar o link'}
        </BotaoPrincipal>
      </form>

      <p className="mt-6 text-xs text-ink-500">
        Lembrou?{' '}
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
