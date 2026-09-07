import { Email } from './email.js';
import { ErroDeIdentidade } from './erros.js';
import { Handle } from './handle.js';
import { validarPoliticaDeSenha } from './politica-senha.js';

export interface PropsCriacaoUser {
  id: string;
  email: string;
  handle: string;
  displayName: string;
  /** Senha em texto puro, só para passar pela política — nunca é guardada. */
  senhaPlana: string;
  /** Hash já calculado pela infraestrutura (Argon2id, issue #44). */
  senhaHash: string;
}

/**
 * Raiz de agregado do `identity`. Protege dois invariantes: não existe
 * instância com e-mail ou handle inválido (o construtor é privado — só se
 * chega a um `User` passando por `Email.criar`/`Handle.criar`), e trocar a
 * senha exige a senha em texto puro correspondente ao hash, que é
 * confrontada com a política antes de qualquer coisa ser gravada.
 *
 * O hash em si não é assunto desta entidade: Argon2id é a issue #44. Aqui
 * o `User` recebe um hash já pronto e só garante que ele nunca chegou sem a
 * política ter rodado sobre o texto puro que o gerou.
 */
export class User {
  private constructor(
    private readonly id: string,
    private email: Email,
    private handle: Handle,
    private displayName: string,
    private senhaHash: string,
  ) {}

  static criar(props: PropsCriacaoUser): User {
    validarPoliticaDeSenha(props.senhaPlana);
    return new User(
      props.id,
      Email.criar(props.email),
      Handle.criar(props.handle),
      normalizarDisplayName(props.displayName),
      props.senhaHash,
    );
  }

  trocarSenha(senhaPlana: string, senhaHash: string): void {
    validarPoliticaDeSenha(senhaPlana);
    this.senhaHash = senhaHash;
  }

  renomear(novoDisplayName: string): void {
    this.displayName = normalizarDisplayName(novoDisplayName);
  }

  getId(): string {
    return this.id;
  }

  getEmail(): Email {
    return this.email;
  }

  getHandle(): Handle {
    return this.handle;
  }

  getDisplayName(): string {
    return this.displayName;
  }

  getSenhaHash(): string {
    return this.senhaHash;
  }
}

function normalizarDisplayName(candidato: string): string {
  const normalizado = candidato.trim();
  if (normalizado.length === 0 || normalizado.length > 60) {
    throw new ErroDeIdentidade('NOME_INVALIDO', 'Nome de exibição inválido');
  }
  return normalizado;
}
