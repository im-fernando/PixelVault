# 0003. Verificar as fronteiras de módulo por lint no CI

Data: 2026-09-07
Status: aceita

## Contexto

A decisão [0002](0002-usar-monolito-modular.md) só vale se a fronteira entre
módulos for real. Fronteira escrita em README não sobrevive a três semanas de
pressa — e sobrevive menos ainda a código gerado por IA, que otimiza para "faz
funcionar agora" e importa o que estiver mais perto.

O projeto de referência resolve isso com testes de arquitetura: em
`src/Tests/ArchTests/Modules/ModuleTests.cs` há um teste por módulo afirmando
que ele não depende dos namespaces dos outros, com exceção explícita para os
handlers de evento de integração.

## Decisão

As fronteiras são verificadas pelo `dependency-cruiser`, no `pnpm lint` e no
CI. Violação é erro, não aviso, e reprova o build.

Regras em vigor (`.dependency-cruiser.cjs`):

- um módulo só enxerga outro pelo `index.ts` dele
- `domain/` não importa `application/`, `infrastructure/` nem `http/`
- `domain/` não conhece Fastify, Prisma nem logger
- `infrastructure/` não conhece `http/`
- Prisma e `@pixelvault/database` só em `infrastructure/`
- `contracts` não arrasta Fastify, React nem Prisma
- `web` e `api` não se importam
- sem dependência circular

Duas configurações são essenciais e não óbvias:

- **`tsPreCompilationDeps: true`.** Sem isso o dependency-cruiser ignora
  `import type`, e um módulo pode importar tipos internos de outro sem que a
  fronteira acuse nada. Foi verificado: a violação passava batido.
- **`doNotFollow` em vez de `exclude` para `dist/` e `generated/`.** Com
  `exclude`, a aresta para `@pixelvault/database` some do grafo e a regra
  `prisma-so-na-infraestrutura` deixa de acusar o vazamento. Com `doNotFollow`,
  o pacote continua sendo nó do grafo, mas não percorremos o código compilado.

## Consequências

A arquitetura passa a ser executável. Quando alguém — pessoa ou agente — furar
a fronteira, o CI diz qual regra foi violada e por quê, com o comentário da
regra no output.

O preço é atrito legítimo: às vezes a resposta certa é exportar mais coisa pelo
`index.ts`, e às vezes é perceber que a dependência está no lugar errado. Esse
segundo caso é exatamente o valor da regra.

Verificado na implantação com três violações propositais — `import type`
cruzando módulo, Prisma na camada HTTP e Fastify no domínio. As três foram
acusadas como erro, com código de saída diferente de zero.

## Alternativas descartadas

**`eslint-plugin-boundaries`.** Funciona por arquivo e não enxerga o grafo, o
que impede regras como "sem ciclos" e torna a checagem de caminho transitivo
inviável.

**Um pacote do workspace por módulo,** deixando o pnpm impor a fronteira.
Impõe de graça, mas multiplica `package.json`, `tsconfig` e passos de build por
módulo — o custo que a [0002](0002-usar-monolito-modular.md) decidiu não pagar.

**Confiar em revisão de código.** Não há segundo revisor neste projeto.
