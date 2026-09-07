import {
  HANDLE_REGEX,
  HANDLES_RESERVADOS,
  TAMANHO_MAXIMO_HANDLE,
  TAMANHO_MINIMO_HANDLE,
} from '@pixelvault/contracts';
import { ErroDeIdentidade } from './erros.js';

/**
 * `handle` é o que vira a URL pública `/u/:handle` na M6. Formato e reserva
 * são checados separadamente (em vez de um único `schema.safeParse`) para
 * que cada falha carregue o código certo — "fernando123!" e "admin" são os
 * dois handles inválidos, mas por motivos que o cliente trata diferente.
 */
export class Handle {
  private constructor(private readonly valor: string) {}

  static criar(candidato: string): Handle {
    const normalizado = candidato.trim().toLowerCase();

    const formatoValido =
      normalizado.length >= TAMANHO_MINIMO_HANDLE &&
      normalizado.length <= TAMANHO_MAXIMO_HANDLE &&
      HANDLE_REGEX.test(normalizado);
    if (!formatoValido) {
      throw new ErroDeIdentidade('HANDLE_INVALIDO', 'Handle inválido');
    }

    if ((HANDLES_RESERVADOS as readonly string[]).includes(normalizado)) {
      throw new ErroDeIdentidade('HANDLE_RESERVADO', `Handle "${normalizado}" é reservado`);
    }

    return new Handle(normalizado);
  }

  igualA(outro: Handle): boolean {
    return this.valor === outro.valor;
  }

  toString(): string {
    return this.valor;
  }
}
