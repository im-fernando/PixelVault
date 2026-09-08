import { z } from 'zod';
import { emailSchema } from './email.js';
import { senhaCandidataSchema } from './senha.js';

/**
 * Quanto tempo o link do e-mail vale.
 *
 * Trinta minutos. O prazo é uma janela de sequestro de conta: quem tiver o
 * link nesse intervalo — porque leu o e-mail por cima do ombro, porque a
 * caixa de entrada está aberta numa máquina compartilhada, porque um
 * encaminhamento automático o copiou — vira dono da conta. Um dia inteiro,
 * que é o padrão de muito produto por aí, transforma um descuido de manhã
 * num problema de noite.
 *
 * Curto demais, por outro lado, irrita quem se comporta normalmente: o
 * e-mail leva alguns segundos (às vezes minutos) para chegar, e muita gente
 * pede a redefinição no computador para abrir o link no celular. Quinze
 * minutos deixaria essa pessoa de fora com frequência, e cada expiração vira
 * um e-mail novo — mais custo no provedor e mais chance de a mensagem
 * parecer spam para o filtro.
 *
 * Trinta minutos é o meio: sobra para chegar, buscar o celular e digitar uma
 * senha; não sobra para o link continuar utilizável na caixa de entrada até
 * a noite. Está no contrato, e não escondido no servidor, porque a tela de
 * pedido diz esse prazo para a pessoa — e as duas não podem discordar.
 */
export const VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS = 30 * 60_000;

/**
 * O token que vai no link: 32 bytes aleatórios em base64url, exatamente como
 * o token de sessão. O tamanho não é validação de segurança (256 bits não se
 * adivinham); é o corte que impede alguém de mandar um megabyte para o
 * servidor hashear.
 */
export const TAMANHO_MAXIMO_TOKEN_DE_RECUPERACAO = 128;

/**
 * Corpo de `POST /api/auth/forgot-password`.
 *
 * Só o e-mail. Nada de handle, nada de "quem é você" — quanto menos a
 * requisição carrega, menos ela pode ser usada para perguntar.
 */
export const forgotPasswordRequestSchema = z.object({
  email: emailSchema,
});
export type ForgotPasswordRequest = z.infer<typeof forgotPasswordRequestSchema>;

/**
 * A resposta é sempre esta, com status 202, exista a conta ou não.
 *
 * 202 e não 200 pelo mesmo motivo que o cadastro responde 202 (ver
 * `registerResponseSchema`): "aceitamos o pedido" é verdade nos dois casos,
 * enquanto qualquer status que afirme o que foi feito seria mentira num
 * deles — e um status que muda conforme o caso é exatamente o oráculo que
 * este endpoint existe para não ser.
 *
 * Não há campo nenhum além do `status`: nem "e-mail enviado", nem quando o
 * link deste pedido expira. O prazo que a tela mostra vem de
 * `VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS`, que é constante e não conta nada
 * sobre a existência da conta.
 */
export const forgotPasswordResponseSchema = z.object({
  status: z.literal('recuperacao-solicitada'),
});
export type ForgotPasswordResponse = z.infer<typeof forgotPasswordResponseSchema>;

/**
 * Corpo de `POST /api/auth/reset-password` — o token que veio no link mais a
 * senha nova.
 *
 * `password` passa pela política inteira: é uma senha sendo escolhida agora,
 * como a do cadastro. Não há `currentPassword` aqui de propósito — quem
 * chega por este caminho é justamente quem não sabe a senha atual, e o token
 * do e-mail é a prova que substitui aquela.
 */
export const resetPasswordRequestSchema = z.object({
  token: z.string().min(1).max(TAMANHO_MAXIMO_TOKEN_DE_RECUPERACAO),
  password: senhaCandidataSchema,
});
export type ResetPasswordRequest = z.infer<typeof resetPasswordRequestSchema>;

/**
 * Resposta da redefinição.
 *
 * `revokedSessions` é quantas sessões caíram — TODAS as da conta, sem
 * exceção, porque quem redefine a senha por e-mail não está logado e
 * portanto não tem nenhuma sessão "atual" a preservar. É o oposto da troca
 * de senha autenticada, que preserva a que fez a troca (ver
 * `changePasswordResponseSchema`), e a diferença é o ponto: se a conta foi
 * invadida, o caminho que o dono legítimo tem para expulsar o invasor é
 * exatamente este.
 */
export const resetPasswordResponseSchema = z.object({
  status: z.literal('senha-redefinida'),
  revokedSessions: z.number().int().nonnegative(),
});
export type ResetPasswordResponse = z.infer<typeof resetPasswordResponseSchema>;
