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

  igualA(outro: Email): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
