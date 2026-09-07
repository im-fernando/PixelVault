import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import Fastify, { type FastifyInstance } from 'fastify';
import {
  jsonSchemaTransform,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Config } from './config.js';
import { registerErrorHandler } from './infrastructure/error-handler.js';
import { catalogRoutes } from './modules/catalog/index.js';

/**
 * Composition root da API.
 *
 * Separado de server.ts de propósito: o app é construído sem abrir porta,
 * o que permite testá-lo com `app.inject()` sem subir rede.
 */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'test' ? 'silent' : 'info',
      ...(config.NODE_ENV === 'development'
        ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss' } } }
        : {}),
    },
    genReqId: () => crypto.randomUUID(),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  registerErrorHandler(app);

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, { origin: config.WEB_ORIGIN, credentials: true });
  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(sensible);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'PixelVault API',
        description: 'Biblioteca de jogos retrô com progresso sincronizado.',
        version: '0.0.0',
      },
    },
    transform: jsonSchemaTransform,
  });
  await app.register(swaggerUi, { routePrefix: '/docs' });

  app.get('/health', { schema: { tags: ['sistema'] } }, async () => ({ status: 'ok' }));
  app.get('/ready', { schema: { tags: ['sistema'] } }, async () => ({ status: 'ready' }));

  // Cada módulo é um plugin encapsulado — o Fastify já nos dá o isolamento de
  // escopo que a referência em .NET obtém com um container de IoC por módulo.
  await app.register(catalogRoutes, { prefix: '/api' });

  return app;
}
