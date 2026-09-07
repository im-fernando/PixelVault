import { randomUUID } from 'node:crypto';
import type { RegisterRequest } from '@pixelvault/contracts';
import { registrarAceiteDosTermos } from '../domain/aceite-de-termos.js';
import { derivarDisplayNameDoHandle } from '../domain/display-name.js';
import { Email } from '../domain/email.js';
import { ErroDeIdentidade } from '../domain/erros.js';
import { Handle } from '../domain/handle.js';
import { validarPoliticaDeSenha } from '../domain/politica-senha.js';
import { User } from '../domain/user.js';
import type { UserRepository } from '../domain/user-repository.js';
import { comErrosTraduzidos } from './traduzir-erro.js';

export interface DependenciasDoCadastro {
  usuarios: UserRepository;
  /** Argon2id vive em `infrastructure/`; o caso de uso só sabe que hasheia. */
  gerarHash: (senhaPlana: string) => Promise<string>;
}

/**
 * Cadastro de conta.
 *
 * A parte delicada não é criar o usuário — é o que acontece quando o e-mail
 * já existe. Cadastro é uma das duas portas de enumeração de usuários (a
 * outra é o login): se a resposta para "e-mail já cadastrado" for diferente
 * da resposta para "conta criada", qualquer pessoa descobre, um e-mail por
 * requisição, quem tem conta aqui. Por isso:
 *
 * 1. Nunca há um `SELECT` por e-mail. Não existe caminho que responda mais
 *    cedo por causa de e-mail duplicado — a colisão só aparece no `INSERT`.
 * 2. Quando o `INSERT` bate na constraint de e-mail, nada foi persistido e
 *    esta função retorna normalmente. Para quem chamou, é indistinguível de
 *    um cadastro que deu certo: mesmo status, mesmo corpo.
 * 3. Os dois caminhos pagam o mesmo custo — a mesma pré-checagem de handle e
 *    o mesmo hash Argon2id (que domina o tempo da requisição) — para que a
 *    diferença também não vaze pelo relógio.
 *
 * Handle duplicado é outra história e é recusado de verdade: o handle não é
 * "existe conta com este e-mail", é o nome que a própria pessoa está
 * tentando escolher. Silenciar isso entregaria uma conta que a pessoa acha
 * que criou e não criou.
 *
 * Limite conhecido: quem repetir a mesma tentativa duas vezes distingue os
 * casos pelo handle (na segunda vez, o handle da primeira estará tomado se e
 * somente se o cadastro tiver acontecido). Fechar essa fresta é papel da
 * verificação de e-mail — enquanto a conta não é verificada ela não serve
 * para nada — e do rate limit, ambos em issues próprias.
 */
export async function registrarUsuario(
  deps: DependenciasDoCadastro,
  entrada: RegisterRequest,
): Promise<void> {
  await comErrosTraduzidos(async () => {
    // Barato primeiro: o que dá para recusar sem pagar o hash é recusado
    // antes dele.
    const email = Email.criar(entrada.email);
    const handle = Handle.criar(entrada.handle);
    validarPoliticaDeSenha(entrada.password);

    // O consentimento é datado quando a requisição chega, pelo relógio do
    // servidor. O corpo não traz timestamp, e se trouxesse seria ignorado.
    const termsAcceptedAt = registrarAceiteDosTermos(entrada.termsAccepted, new Date());

    const displayName = entrada.displayName ?? derivarDisplayNameDoHandle(handle.toString());

    if (await deps.usuarios.handleEmUso(handle.toString())) {
      throw new ErroDeIdentidade('HANDLE_EM_USO', 'Esse nome de usuário já está em uso');
    }

    const senhaHash = await deps.gerarHash(entrada.password);
    const user = User.criar({
      id: randomUUID(),
      email: email.toString(),
      handle: handle.toString(),
      displayName,
      senhaPlana: entrada.password,
      senhaHash,
    });

    const resultado = await deps.usuarios.cadastrar({
      id: user.getId(),
      email: user.getEmail().toString(),
      handle: user.getHandle().toString(),
      displayName: user.getDisplayName(),
      senhaHash: user.getSenhaHash(),
      termsAcceptedAt,
    });

    // A pré-checagem acima resolve o caso comum; esta é a corrida, em que
    // dois cadastros com o mesmo handle passaram pelo `SELECT` juntos. Quem
    // decide é a constraint do banco.
    if (resultado === 'handle-ja-cadastrado') {
      throw new ErroDeIdentidade('HANDLE_EM_USO', 'Esse nome de usuário já está em uso');
    }

    // 'criado' e 'email-ja-cadastrado' terminam aqui do mesmo jeito. É o
    // ponto inteiro da anti-enumeração — ver o cabeçalho desta função.
  });
}
