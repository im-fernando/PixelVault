# Arquitetura

Monólito modular. As decisões e os porquês estão no
[log de ADRs](adr/README.md); este documento descreve o desenho resultante.

## Visão geral

```
┌──────────────┐        HTTP + contratos Zod        ┌──────────────────┐
│  apps/web    │ ─────────────────────────────────► │    apps/api      │
│  React/Vite  │                                    │    Fastify       │
│              │                                    │                  │
│  emulação    │                                    │  ┌────────────┐  │
│  em WASM     │                                    │  │  módulos   │  │
│  no cliente  │                                    │  └────────────┘  │
└──────────────┘                                    └────────┬─────────┘
       │                                                     │
       │                                            ┌────────┴─────────┐
       ▼                                            ▼                  ▼
  OPFS/IndexedDB                              PostgreSQL          S3 (R2/MinIO)
  (save local)                                (metadados)         (ROMs e saves)
```

O servidor nunca emula nem transmite vídeo. Arquivos binários vivem no storage;
o PostgreSQL guarda metadados e referências.

## Módulos da API

Cada um em `apps/api/src/modules/<nome>/`, com `index.ts` como única superfície
pública.

| Módulo     | Responsabilidade                            | Modelo    |
| ---------- | ------------------------------------------- | --------- |
| `identity` | Contas, sessão, autorização                 | rico (M2) |
| `catalog`  | Jogos, consoles, capas, hashes conhecidos   | CRUD      |
| `library`  | ROMs do usuário, favoritos, dedupe          | CRUD      |
| `progress` | SRAM, save states, revisões, conflito       | **rico**  |
| `sessions` | Início e fim de partida, playtime creditado | **rico**  |

`achievements` e `leaderboards` nascem na M6. Pasta vazia antes disso seria o
over-engineering que a [ADR 0002](adr/0002-usar-monolito-modular.md) evita.

## Camadas dentro do módulo

```
domain/          regra e portas. Não conhece framework, Prisma nem logger.
application/     casos de uso. Orquestram o domínio através das portas.
infrastructure/  adaptadores. Prisma, storage, serviços externos.
http/            rotas Fastify. Validam, delegam, serializam.
```

A dependência aponta para dentro: `http` → `application` → `domain`, e
`infrastructure` implementa o que `domain` declarou.

## As fronteiras são executáveis

`pnpm lint:boundaries` reprova o build quando:

- um módulo importa as tripas de outro em vez do `index.ts` — inclusive por
  `import type`
- `domain/` importa `application/`, `infrastructure/` ou `http/`
- `domain/` conhece Fastify, Prisma ou logger
- `infrastructure/` conhece `http/`
- Prisma aparece fora de `infrastructure/`
- `contracts` arrasta Fastify, React ou Prisma
- `web` e `api` se importam
- existe ciclo

Ver [ADR 0003](adr/0003-fronteiras-de-modulo-verificadas-por-lint.md).

## Portas externas

Arquitetura hexagonal **só** onde o mundo externo é instável
([ADR 0004](adr/0004-hexagonal-apenas-nas-integracoes-externas.md)):

| Porta               | Adaptadores previstos                                                         |
| ------------------- | ----------------------------------------------------------------------------- |
| Storage             | MinIO (desenvolvimento), R2 (produção)                                        |
| Runtime de emulação | Nostalgist.js ([ADR 0011](adr/0011-escolha-do-runtime-de-emulacao.md))        |
| Metadados           | IGDB, TheGamesDB, No-Intro                                                    |
| RetroAchievements   | adiado ([ADR 0008](adr/0008-viabilidade-de-conquistas-por-evento-de-jogo.md)) |

O banco **não** é porta.

## Pacotes compartilhados

| Pacote                  | Papel                                                                         |
| ----------------------- | ----------------------------------------------------------------------------- |
| `@pixelvault/contracts` | Schemas Zod compartilhados por web e api. Puro: sem Fastify, React ou Prisma. |
| `@pixelvault/database`  | Prisma, client e migrations.                                                  |
| `@pixelvault/config`    | Presets de TypeScript e ESLint.                                               |

`packages/emulator-runtime` chega na M1, com o contrato `EmulatorAdapter`.
