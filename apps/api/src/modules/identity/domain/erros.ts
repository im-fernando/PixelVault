import type { CodigoErroIdentity } from '@pixelvault/contracts';

/**
 * Erro de domínio do `identity`: carrega um código estável, não um status
 * HTTP — mapear invariante violada para 4xx é responsabilidade da camada
 * `http/`, que ainda não existe (a rota nasce em outra issue da M2). O
 * `code` é o que o contrato promete manter estável entre versões.
 */
export class ErroDeIdentidade extends Error {
  constructor(
    readonly codigo: CodigoErroIdentity,
    message: string,
  ) {
    super(message);
    this.name = 'ErroDeIdentidade';
  }
}
