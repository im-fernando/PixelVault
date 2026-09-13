import type { LoginRequest } from '@pixelvault/contracts';
import { Email } from '../domain/email.js';
import { ErroDeIdentidade } from '../domain/erros.js';
import type { DadosDoUsuario, UserRepository } from '../domain/user-repository.js';
import { comErrosTraduzidos } from './traduzir-erro.js';

export interface ResultadoDaVerificacao {
  valida: boolean;
  /** Hash recalculado com os parâmetros atuais, quando o guardado envelheceu. */
  novoHash?: string;
}

export interface DependenciasDaAutenticacao {
  usuarios: UserRepository;
  /** `verificarERehash` do Argon2id — o caso de uso só sabe que compara. */
  verificar: (senhaPlana: string, hash: string) => Promise<ResultadoDaVerificacao>;
  /**
   * Hash contra o qual verificar quando o e-mail não tem conta. É o que
   * iguala o tempo dos dois caminhos — ver o cabeçalho desta função e
   * `infrastructure/hash-de-senha.ts`.
   */
  hashDescartavel: string;
}

/**
 * Login.
 *
 * O login é a segunda porta de enumeração de usuários (a primeira é o
 * cadastro, tratado em `registrar-usuario.ts`). Fechar essa porta exige três
 * coisas ao mesmo tempo, e faltando uma as outras duas não valem nada:
 *
 * 1. **Mesmo código de erro.** `CREDENCIAIS_INVALIDAS` para e-mail que não
 *    existe e para senha errada. Não há um código para cada.
 * 2. **Mesma mensagem.** "E-mail ou senha incorretos", literalmente a mesma
 *    string, com o mesmo status 401 e o mesmo corpo.
 * 3. **Mesmo tempo.** Esta é a que costuma ficar de fora, e é a mais fácil
 *    de explorar: se o caminho "e-mail não existe" retornasse sem verificar
 *    senha nenhuma, ele responderia em ~1 ms contra os ~330 ms de um Argon2id
 *    de verdade. Um script mede a diferença e separa contas existentes de
 *    inexistentes com precisão perfeita, sem nunca acertar uma senha.
 *
 * O item 3 é o motivo do `hashDescartavel`: quando o e-mail não tem dono,
 * verificamos a senha oferecida contra um hash de senha aleatória que
 * ninguém conhece. O resultado é sempre falso e o custo é exatamente o de
 * uma verificação real, porque o hash foi calculado com os mesmos
 * parâmetros. Não há `if` que devolva mais cedo — as duas pontas passam
 * pelo mesmo Argon2 antes de qualquer decisão.
 *
 * Pela mesma razão, um e-mail malformado também paga o pedágio: `Email` não
 * consegue normalizá-lo, a busca vai adiante com o texto cru (que não acha
 * nada) e a verificação roda mesmo assim. Recusar cedo aqui devolveria um
 * atalho de tempo, ainda que só para entradas que nunca seriam conta.
 *
 * O que NÃO é indistinguível, de propósito: sucesso e fracasso. Quem acertou
 * a senha recebe 200 e um cookie; quem errou recebe 401. Esconder isso seria
 * esconder o próprio login.
 */
export async function autenticarUsuario(
  deps: DependenciasDaAutenticacao,
  entrada: LoginRequest,
): Promise<DadosDoUsuario> {
  return comErrosTraduzidos(async () => {
    const credenciais = await deps.usuarios.buscarCredenciaisPorEmail(
      // A mesma normalização que o rate limit usa para escolher o balde da
      // tentativa. Quando o texto não passa pelo value object, a busca vai
      // adiante com a versão crua e simplesmente não acha nada — o caminho
      // precisa ter o mesmo formato dos outros. Ver `Email.chaveDeBusca`.
      Email.chaveDeBusca(entrada.email),
    );

    // A linha que sustenta o item 3: sem conta, verifica contra o hash
    // descartável. `verificar` roda em todos os caminhos, sempre.
    const hashParaConferir = credenciais?.senhaHash ?? deps.hashDescartavel;
    const resultado = await deps.verificar(entrada.password, hashParaConferir);

    if (credenciais === null || !resultado.valida) {
      throw new ErroDeIdentidade('CREDENCIAIS_INVALIDAS', 'E-mail ou senha incorretos');
    }

    // Reidratação do Argon2id: quem entrou com um hash de parâmetros antigos
    // sai daqui já migrado, sem perceber. Só acontece depois da senha
    // conferida, então tentativa errada nunca aciona escrita no banco.
    if (resultado.novoHash !== undefined) {
      await deps.usuarios.regravarSenhaHash(credenciais.id, resultado.novoHash);
    }

    return {
      id: credenciais.id,
      email: credenciais.email,
      handle: credenciais.handle,
      displayName: credenciais.displayName,
      publicProfile: credenciais.publicProfile,
    };
  });
}
