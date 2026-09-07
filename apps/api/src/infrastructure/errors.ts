import type { ErrorCode } from '@pixelvault/contracts';

/**
 * Erro de domínio: representa uma regra de negócio violada, não uma falha
 * técnica. Vira 4xx com código estável. O cliente decide o que fazer a
 * partir do `code`, nunca da mensagem.
 */
export class DomainError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'DomainError';
  }
}

export class NotFoundError extends DomainError {
  constructor(recurso: string) {
    super('NOT_FOUND', `${recurso} não encontrado`, 404);
  }
}

export class ConflictError extends DomainError {
  constructor(message: string, details?: Record<string, string[]>) {
    super('CONFLICT', message, 409, details);
  }
}

export class UnauthenticatedError extends DomainError {
  constructor(message = 'Autenticação necessária') {
    super('UNAUTHENTICATED', message, 401);
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = 'Acesso negado') {
    super('FORBIDDEN', message, 403);
  }
}
