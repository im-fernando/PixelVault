/**
 * Fronteiras de arquitetura do PixelVault — verificadas no CI.
 *
 * Equivalente em TypeScript ao `ModuleTests.cs` do projeto de referência
 * (modular-monolith-with-ddd): a fronteira entre módulos não é convenção
 * de README, é build vermelho. Ver docs/adr/0003.
 */

const MODULOS = '^apps/api/src/modules';

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'modulo-so-pelo-index',
      severity: 'error',
      comment:
        'Um módulo só pode enxergar outro pelo index.ts dele. Importar domain/, ' +
        'application/ ou infrastructure/ de outro módulo dissolve a fronteira. ' +
        'Se você precisa de algo que o index não exporta, ou o index deveria ' +
        'exportar, ou a dependência está no lugar errado.',
      from: { path: `${MODULOS}/([^/]+)/` },
      to: {
        path: `${MODULOS}/([^/]+)/.+`,
        pathNot: [`${MODULOS}/$1/`, `${MODULOS}/[^/]+/index\\.ts$`],
      },
    },
    {
      name: 'dominio-nao-conhece-as-bordas',
      severity: 'error',
      comment:
        'domain/ é o centro: não pode importar application/, infrastructure/ nem http/. ' +
        'A dependência aponta para dentro, nunca para fora.',
      from: { path: `${MODULOS}/[^/]+/domain/` },
      to: { path: `${MODULOS}/[^/]+/(application|infrastructure|http)/` },
    },
    {
      name: 'dominio-e-puro',
      severity: 'error',
      comment:
        'domain/ não conhece framework algum — nada de Fastify, Prisma ou logger. ' +
        'Regra de negócio precisa ser testável sem subir nada.',
      from: { path: `${MODULOS}/[^/]+/domain/` },
      to: { path: 'node_modules/(fastify|@fastify|@prisma/client|pino)|^packages/database/' },
    },
    {
      name: 'infraestrutura-nao-conhece-http',
      severity: 'error',
      comment: 'infrastructure/ implementa portas do domínio; a camada HTTP está acima dela.',
      from: { path: `${MODULOS}/[^/]+/infrastructure/` },
      to: { path: `${MODULOS}/[^/]+/http/` },
    },
    {
      name: 'prisma-so-na-infraestrutura',
      severity: 'error',
      comment:
        'O acesso a banco fica confinado em infrastructure/. Prisma vazando para ' +
        'application/ ou http/ transforma o Prisma na arquitetura do projeto.',
      from: {
        path: '^apps/api/src/',
        pathNot: ['/infrastructure/', '^apps/api/src/infrastructure/'],
      },
      to: { path: 'node_modules/@prisma/client|^packages/database/' },
    },
    {
      name: 'contracts-e-puro',
      severity: 'error',
      comment:
        '@pixelvault/contracts é compartilhado por web e api: não pode arrastar ' +
        'Fastify, React nem Prisma para o outro lado.',
      from: { path: '^packages/contracts/' },
      to: { path: 'node_modules/(fastify|@fastify|react|react-dom|@prisma/client|@tanstack)' },
    },
    {
      name: 'web-nao-importa-api',
      severity: 'error',
      comment: 'O front conversa com o back por HTTP e contratos, nunca por import.',
      from: { path: '^apps/(web|api)/' },
      to: { path: '^apps/(web|api)/', pathNot: '^apps/$1/' },
    },
    {
      name: 'sem-ciclos',
      severity: 'error',
      comment: 'Dependência circular é fronteira que já quebrou.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sem-modulo-orfao',
      severity: 'warn',
      comment: 'Arquivo que ninguém importa costuma ser código morto.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)(eslint|vite|vitest|prisma)\\.config\\.[cm]?[jt]s$',
          // Fachadas de módulo ainda vazias, que ganham conteúdo na milestone delas.
          `${MODULOS}/[^/]+/index\\.ts$`,
        ],
      },
      to: {},
    },
  ],

  options: {
    // Sem isto o dependency-cruiser ignora `import type`, e um módulo poderia
    // importar tipos internos de outro sem que a fronteira acusasse nada.
    tsPreCompilationDeps: true,
    // doNotFollow, e não exclude: o pacote do workspace continua aparecendo como
    // nó do grafo (e portanto as regras o enxergam), mas não percorremos o
    // código compilado dele. Com `exclude`, a aresta some e a regra
    // `prisma-so-na-infraestrutura` deixa de acusar o vazamento.
    doNotFollow: { path: '(node_modules|/dist/|/generated/)' },
    exclude: { path: '(/\\.turbo/|/coverage/|\\.test\\.ts$)' },
    moduleSystems: ['es6', 'cjs'],
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
