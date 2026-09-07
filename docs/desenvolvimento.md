# Desenvolvimento

## Requisitos

- Node 22 ou superior
- pnpm 11 ou superior (`corepack enable`)
- Docker com Compose

## Do zero

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Serviço             | Endereço                                              |
| ------------------- | ----------------------------------------------------- |
| Front               | <http://localhost:5173>                               |
| API                 | <http://localhost:3333>                               |
| Documentação da API | <http://localhost:3333/docs>                          |
| PostgreSQL          | `localhost:5437` (`pixelvault` / `pixelvault`)        |
| MinIO (S3)          | <http://localhost:9000>                               |
| Console do MinIO    | <http://localhost:9001> (`pixelvault` / `pixelvault`) |

> O PostgreSQL escuta na **5437**, e não na 5432, para não colidir com outros
> projetos na mesma máquina. Se a 5437 também estiver ocupada, mude o mapeamento
> no `docker-compose.yml` e a `DATABASE_URL` no `.env`.

## Verificação

```bash
pnpm lint          # ESLint + fronteiras de módulo
pnpm lint:boundaries
pnpm typecheck
pnpm test
pnpm build
```

Rodando duas vezes seguidas, a segunda deve dizer `>>> FULL TURBO`. Se não
disser, alguma task está com cache desligado ou com `inputs` errados.

## Banco

```bash
pnpm db:migrate    # cria e aplica migration em desenvolvimento
pnpm db:generate   # regera o client do Prisma
pnpm db:seed       # popula sistemas e catálogo (idempotente)
pnpm db:studio     # inspeção visual
```

O `.env` é **único e mora na raiz** — não há `.env` por pacote. O
`prisma.config.ts` e o `server.ts` carregam a partir da raiz explicitamente.

## Problemas comuns

**`DATABASE_URL não definida`** — falta copiar `.env.example` para `.env`.

**`port is already allocated`** — outro serviço ocupa a porta. Ajuste o
mapeamento no `docker-compose.yml` e a URL correspondente no `.env`.

**`typescript-eslint does not support TS 7.0`** — algo subiu o TypeScript
acima da 6.x. O `overrides` no `pnpm-workspace.yaml` deveria impedir; ver
[ADR 0007](adr/0007-fixar-typescript-6.md).

**Fronteira reprovada no lint** — leia o comentário da regra no output. Ele
diz qual princípio foi violado. Contornar a regra quase nunca é a resposta
certa; ver [ADR 0003](adr/0003-fronteiras-de-modulo-verificadas-por-lint.md).
