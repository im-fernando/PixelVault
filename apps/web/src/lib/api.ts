import type { ZodType } from 'zod';
import { apiErrorSchema, type ApiError } from '@pixelvault/contracts';
import { env } from '../env.js';

/**
 * Erro vindo da API, já com o código estável do contrato. O componente
 * decide o que fazer a partir do `code`, nunca da mensagem.
 */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly payload: ApiError,
  ) {
    super(payload.message);
    this.name = 'ApiRequestError';
  }
}

/**
 * Cliente HTTP tipado pelo contrato compartilhado.
 *
 * A resposta é validada contra o mesmo schema Zod que a API usa para
 * serializar: se os dois lados divergirem, o erro aparece aqui e agora, e
 * não como `undefined` três telas adiante.
 */
export async function apiFetch<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  // O `content-type` só entra quando há corpo, e isso não é elegância: o
  // Fastify recusa com 500 uma requisição que se anuncia como JSON e chega
  // vazia ("Body cannot be empty when content-type is set to
  // 'application/json'"). Mutação sem corpo é o caso normal de um sub-recurso
  // — `PUT .../favorite`, `DELETE .../:id` —, e declarar um tipo de conteúdo
  // que não existe quebraria todas elas.
  const response = await fetch(`${env.VITE_API_URL}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init?.body === undefined || init.body === null
        ? {}
        : { 'content-type': 'application/json' }),
      ...init?.headers,
    },
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    const parsed = apiErrorSchema.safeParse(body);
    throw new ApiRequestError(
      response.status,
      parsed.success ? parsed.data : { code: 'INTERNAL', message: 'Erro inesperado' },
    );
  }

  return schema.parse(body);
}
