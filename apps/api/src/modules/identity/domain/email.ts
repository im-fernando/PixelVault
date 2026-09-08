import { emailSchema } from '@pixelvault/contracts';
import { ErroDeIdentidade } from './erros.js';

/**
 * E-mail é a identidade de login: "Fulano@X.com" e "fulano@x.com" precisam
 * ser a mesma conta. Normalizar na criação (trim + minúsculas) é o que torna
 * a comparação um `===` simples, em vez de espalhar `.toLowerCase()` por
 * todo lugar que compara e-mail — incluindo, mais cedo ou mais tarde, uma
 * consulta ao banco que esqueceria de normalizar.
 */
export class Email {
  private constructor(private readonly valor: string) {}

  static criar(candidato: string): Email {
    const normalizado = candidato.trim().toLowerCase();
    const resultado = emailSchema.safeParse(normalizado);
    if (!resultado.success) {
      throw new ErroDeIdentidade('EMAIL_INVALIDO', 'E-mail inválido');
    }
    return new Email(resultado.data);
  }

  /**
   * O e-mail normalizado do jeito que o cadastro o gravou, aceitando também
   * o que nunca seria um e-mail válido — nesse caso, a normalização crua.
   *
   * Existe porque duas partes do login precisam da mesma chave a partir de
   * um texto que ainda não se sabe se é e-mail: a busca do usuário e o
   * contador de tentativas. Se as duas normalizassem por conta própria,
   * bastaria alternar maiúsculas para que cada variação virasse um balde de
   * rate limit diferente enquanto todas caem na mesma conta.
   */
  static chaveDeBusca(candidato: string): string {
    try {
      return Email.criar(candidato).toString();
    } catch {
      return candidato.trim().toLowerCase();
    }
  }

  igualA(outro: Email): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
