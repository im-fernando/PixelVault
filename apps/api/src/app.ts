import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
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
import { RateLimitedError } from './infrastructure/errors.js';
import { criarArmazenamentoS3 } from './infrastructure/storage/armazenamento-s3.js';
import { catalogRoutes } from './modules/catalog/index.js';
import {
  criarEnvioDeEmail,
  criarLimitesDeAutenticacao,
  identityRoutes,
} from './modules/identity/index.js';
import { libraryRoutes } from './modules/library/index.js';
import { criarSessoes, sessionsRoutes } from './modules/sessions/index.js';

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
      // Nenhum log da aplicação escreve corpo de requisição, e o serializer
      // padrão do Fastify também não. Isto é a rede embaixo: se um dia
      // alguém pendurar um objeto inteiro num log de depuração, a senha
      // tentada não vai junto. Ver docs/seguranca.md.
      redact: {
        paths: [
          'password',
          'currentPassword',
          'newPassword',
          '*.password',
          '*.currentPassword',
          '*.newPassword',
          'body',
          'req.body',
        ],
        censor: '[redigido]',
      },
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
  // `methods` explícito porque o padrão do @fastify/cors é `GET,HEAD,POST` — os
  // métodos "simples" do CORS —, e o preflight de qualquer outro volta negado.
  // Sem isto, `PUT /library/roms/:id/favorite` e `DELETE /library/roms/:id` são
  // recusados pelo navegador antes de chegarem à API, e o erro aparece só no
  // console do cliente: no `curl` e no `app.inject()` da suíte tudo passa,
  // porque nenhum dos dois faz preflight. A lista é a dos verbos que as rotas
  // deste servidor de fato aceitam.
  await app.register(cors, {
    origin: config.WEB_ORIGIN,
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'DELETE'],
  });

  // Teto genérico da API, por IP, em memória. É higiene contra cliente
  // desgovernado, não defesa de credencial: por isso é folgado, e por isso
  // não faz mal ele viver na memória do processo — com N instâncias o teto
  // efetivo vira N × 300/min, e nenhuma garantia de segurança depende disso.
  // Quem defende as rotas de credencial é outro mecanismo, com contador
  // compartilhado no PostgreSQL e limites bem mais estreitos
  // (`criarLimitesDeAutenticacao`, docs/adr/0019).
  //
  // A ordem de registro é a ordem dos hooks: depois do CORS, para que o 429
  // saia com os cabeçalhos de origem e o navegador consiga ler o corpo em
  // vez de reportar um erro de CORS; antes da resolução de sessão, para que
  // requisição cortada aqui não chegue a consultar o banco.
  await app.register(rateLimit, {
    max: 300,
    timeWindow: '1 minute',
    // O plugin lança o que este builder devolver; devolvendo um DomainError,
    // a resposta 429 sai pelo mesmo tradutor de erro de todo o resto e chega
    // ao cliente no formato `ApiError`, com requestId.
    errorResponseBuilder: () => new RateLimitedError('LIMITE_POR_IP'),
  });

  await app.register(cookie, { secret: config.SESSION_SECRET });
  await app.register(sensible);

  // Depois do @fastify/cookie (que precisa ter parseado o cookie antes) e
  // antes das rotas: `registrarEm` instala o hook que resolve a sessão e
  // decora `request.userId`, e hook de raiz só alcança rota registrada
  // depois dele. `Secure` cai apenas em desenvolvimento, onde o front fala
  // com http://localhost. Ver docs/adr/0017.
  const sessoes = criarSessoes({ cookieSeguro: config.NODE_ENV !== 'development' });
  sessoes.registrarEm(app);

  // A porta de object storage, montada uma vez para a aplicação inteira: o
  // `S3Client` mantém pool de conexão, e criar um por requisição jogaria isso
  // fora. Quem a consome hoje é o `library` (upload de ROM); o `progress` da
  // M4 recebe a mesma instância. Ver docs/adr/0012.
  const armazenamento = criarArmazenamentoS3({
    endpoint: config.S3_ENDPOINT,
    regiao: config.S3_REGION,
    bucket: config.S3_BUCKET,
    chaveDeAcesso: config.S3_ACCESS_KEY_ID,
    segredo: config.S3_SECRET_ACCESS_KEY,
    caminhoNoEstiloDePasta: config.S3_FORCE_PATH_STYLE,
  });

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
  await app.register(identityRoutes, {
    prefix: '/api',
    sessoes,
    // As rotas de credencial são as únicas com contador por IP e por
    // identificador tentado. As de sessão (`/auth/logout`,
    // `/auth/sessions/*`) ficam de fora: todas exigem cookie válido, então
    // não são superfície de adivinhação de credencial — quem chega nelas já
    // provou quem é. Ver docs/seguranca.md.
    limites: criarLimitesDeAutenticacao({ segredo: config.SESSION_SECRET }),
    // Console em desenvolvimento e em teste, Resend em produção — decidido
    // por `EMAIL_TRANSPORTE`, com padrão derivado do `NODE_ENV`, do mesmo
    // jeito que o `Secure` do cookie acima. Ver docs/adr/0021.
    envioDeEmail: criarEnvioDeEmail({
      transporte: config.transporteDeEmail,
      chaveDeApi: config.RESEND_API_KEY,
      remetente: config.EMAIL_REMETENTE,
    }),
    // O link do e-mail é montado a partir daqui, nunca do `Host` da
    // requisição — ver `domain/email-de-recuperacao.ts`.
    origemDoFront: config.WEB_ORIGIN,
  });
  // As rotas de sessão são do módulo `sessions`, ainda que a URL comece com
  // `/auth`: quem lista e revoga sessão é o dono do ciclo de vida dela.
  await app.register(sessionsRoutes, { prefix: '/api', sessoes });
  await app.register(libraryRoutes, { prefix: '/api', sessoes, armazenamento });

  return app;
}
