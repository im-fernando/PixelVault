# Convenções do PixelVault

Leitura obrigatória antes de qualquer mudança estrutural:
**[docs/adr/README.md](docs/adr/README.md)**. As ADRs explicam por que o código
é assim; mudar a estrutura sem lê-las costuma reintroduzir algo que já foi
rejeitado com motivo.

## O que é o projeto

Biblioteca de jogos retrô jogável no navegador, com progresso sincronizado.
A emulação roda no cliente em WebAssembly; o servidor entrega arquivos, cuida
das contas e guarda o progresso.

**BYOR:** o usuário envia as próprias ROMs e elas são privadas dele. O catálogo
é de metadados, e o público tem só homebrew. Nunca escreva código que sirva ROM
de um usuário para outro. Ver [ADR 0006](docs/adr/0006-byor-mais-catalogo-de-metadados.md).

## Onde colocar código novo

```
apps/api/src/modules/<modulo>/
├── domain/           regra de negócio e portas. Sem framework, sem Prisma.
├── application/      casos de uso. Orquestram o domínio.
├── infrastructure/   adaptadores: Prisma, storage, serviços externos.
├── http/             rotas Fastify. Validam, delegam, serializam.
└── index.ts          ÚNICA superfície pública do módulo.
```

Módulos existentes: `identity`, `catalog`, `library`, `progress`, `sessions`.
`achievements` e `leaderboards` nascem na M6 — não crie a pasta antes.

O front é organizado por feature (`apps/web/src/features/<feature>/`), não por
tipo de arquivo.

## O que não fazer

- **Não cruzar fronteira de módulo.** Um módulo só enxerga outro pelo
  `index.ts`. Vale também para `import type` — a checagem pega. Se o `index`
  não exporta o que você precisa, ou ele deveria exportar, ou a dependência
  está no lugar errado.
- **Não colocar regra de negócio no controller.** A camada `http/` valida,
  delega e serializa. Nada além disso.
- **Não usar Prisma fora de `infrastructure/`.** Se o Prisma aparece no caso de
  uso, o Prisma virou a arquitetura do projeto.
- **Não criar pacote do workspace por módulo.** Módulos são pastas. Ver
  [ADR 0002](docs/adr/0002-usar-monolito-modular.md).
- **Não criar entidade rica em `catalog` nem em `library`.** Eles são CRUD de
  propósito. Ver [ADR 0005](docs/adr/0005-dominio-rico-somente-onde-ha-invariante.md).
- **Não confiar em tempo declarado pelo cliente.** Playtime, XP e score são
  creditados pelo relógio do servidor. Ver ADR 0009 (a escrever, M6).
- **Não subir o TypeScript para a 7.** Quebra o `typescript-eslint`, e é o lint
  que sustenta as fronteiras. Ver [ADR 0007](docs/adr/0007-fixar-typescript-6.md).

## Antes de abrir PR

```bash
pnpm lint          # inclui as fronteiras de módulo
pnpm typecheck
pnpm test
pnpm build
```

Se `pnpm lint:boundaries` reclamar, leia o comentário da regra no output antes
de tentar contorná-la — ele diz qual princípio foi violado.

## Estilo

- Código, comentário, commit e documentação em **português do Brasil**.
- Comentário explica **por quê**, nunca o quê. Se o código precisa de comentário
  para dizer o que faz, o código é que precisa mudar.
- Nomes de domínio em português; nomes de API pública e de banco seguem o que já
  existe (`camelCase` no TypeScript, `snake_case` nas colunas).
- Nada de `any`. A regra é erro, não aviso.
