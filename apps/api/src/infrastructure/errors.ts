import type { ErrorCode, MotivoDeLimite } from '@pixelvault/contracts';

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

/**
 * Rate limit estourado.
 *
 * A mensagem é a mesma para os dois eixos e não diz qual conta, qual IP nem
 * quantas tentativas faltavam: quem estourou o limite não precisa de um
 * relatório do que o servidor sabe sobre ele. Qual eixo cortou vai em
 * `details.rateLimit`, para quem está depurando de boa-fé, e quando voltar
 * vai no cabeçalho `retry-after`, que o cliente honesto obedece.
 */
export class RateLimitedError extends DomainError {
  constructor(motivo: MotivoDeLimite) {
    super('RATE_LIMITED', 'Tentativas demais. Tente de novo em alguns minutos.', 429, {
      rateLimit: [motivo],
    });
  }
}
