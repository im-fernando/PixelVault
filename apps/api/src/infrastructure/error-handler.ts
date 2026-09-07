import type { FastifyInstance } from 'fastify';
import { hasZodFastifySchemaValidationErrors } from 'fastify-type-provider-zod';
import type { ApiError } from '@pixelvault/contracts';
import { DomainError } from './errors.js';

/**
 * Tradutor único de exceção para resposta HTTP.
 *
 * Erro de domínio vira 4xx com código estável; qualquer outra coisa é 500
 * e não vaza detalhe interno para o cliente — o detalhe vai para o log,
 * com o requestId para correlacionar.
 */
export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    if (hasZodFastifySchemaValidationErrors(error)) {
      const details: Record<string, string[]> = {};
      for (const issue of error.validation) {
        const campo = issue.instancePath.replace(/^\//, '') || '(corpo)';
        (details[campo] ??= []).push(issue.message ?? 'inválido');
      }

      const body: ApiError = {
        code: 'VALIDATION_FAILED',
        message: 'Requisição inválida',
        details,
        requestId: request.id,
      };
      return reply.status(400).send(body);
    }

    if (error instanceof DomainError) {
      const body: ApiError = {
        code: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId: request.id,
      };
      return reply.status(error.status).send(body);
    }

    request.log.error({ err: error }, 'erro não tratado');

    const body: ApiError = {
      code: 'INTERNAL',
      message: 'Erro interno',
      requestId: request.id,
    };
    return reply.status(500).send(body);
  });
}
