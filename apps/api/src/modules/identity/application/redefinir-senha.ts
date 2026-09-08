import type { ResetPasswordRequest } from '@pixelvault/contracts';
import { ErroDeIdentidade } from '../domain/erros.js';
import { validarPoliticaDeSenha } from '../domain/politica-senha.js';
import type { TokenDeRecuperacaoRepository } from '../domain/token-de-recuperacao-repository.js';
import type { UserRepository } from '../domain/user-repository.js';
import { comErrosTraduzidos } from './traduzir-erro.js';

export interface DependenciasDaRedefinicao {
  usuarios: UserRepository;
  tokens: TokenDeRecuperacaoRepository;
  hashDoToken: (token: string) => string;
  gerarHash: (senhaPlana: string) => Promise<string>;
  agora: () => Date;
}

/**
 * Redefinição de senha pelo link do e-mail.
 *
 * Devolve o `userId` de quem teve a senha trocada, porque quem revoga as
 * sessões é o módulo `sessions` e quem costura os dois é a rota — a mesma
 * divisão que a troca de senha autenticada já usa.
 *
 * A ordem dos quatro passos é a decisão de segurança deste arquivo:
 *
 * 1. **A política de senha primeiro.** É a única checagem que roda antes de
 *    o token ser gasto, e por um motivo de gentileza: quem clicou no link e
 *    escolheu uma senha fraca precisa poder tentar de novo com uma senha
 *    melhor, no mesmo link. Queimar o token por uma senha curta obrigaria a
 *    pessoa a pedir outro e-mail para consertar o próprio erro de digitação.
 *    Não vaza nada: a resposta é sobre a senha oferecida, não sobre o token.
 * 2. **Gastar o token.** Um comando só, que apaga e devolve o dono
 *    (`consumir`). É aqui que "uma vez só" acontece de verdade — a segunda
 *    tentativa com o mesmo token não acha linha nenhuma, exatamente como um
 *    token inventado.
 * 3. **Só então o Argon2id.** O hash custa ~330 ms (docs/seguranca.md) e
 *    esta é uma rota aberta, sem sessão. Se ele viesse antes da validação do
 *    token, qualquer pessoa poderia queimar CPU do servidor mandando token
 *    lixo — o mesmo vetor de negação de serviço que o login tem, mas sem o
 *    contador estreito que protege o login. Pagando o hash só depois de um
 *    token válido, o custo fica atrás de 256 bits que ninguém adivinha.
 * 4. **Invalidar o resto.** Quem pediu dois links não deve ficar com o
 *    segundo vivo depois de usar o primeiro.
 *
 * O token gasto no passo 2 não volta se o passo 3 falhar. É deliberado: a
 * alternativa é uma transação segurando a linha durante um Argon2id inteiro,
 * e o custo de errar é a pessoa pedir outro link — barato perto de uma
 * conexão presa por meio segundo em cada redefinição.
 */
export async function redefinirSenha(
  deps: DependenciasDaRedefinicao,
  entrada: ResetPasswordRequest,
): Promise<string> {
  return comErrosTraduzidos(async () => {
    validarPoliticaDeSenha(entrada.password);

    const userId = await deps.tokens.consumir(deps.hashDoToken(entrada.token), deps.agora());
    if (userId === null) {
      // Um código só para "nunca existiu", "já foi usado" e "venceu". Ver
      // `codigoErroIdentitySchema` no contrato para o porquê.
      throw new ErroDeIdentidade('TOKEN_INVALIDO', 'Este link não vale mais');
    }

    await deps.usuarios.regravarSenhaHash(userId, await deps.gerarHash(entrada.password));
    await deps.tokens.invalidarDoUsuario(userId);

    return userId;
  });
}
