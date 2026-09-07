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

## Assets de emulação

A emulação roda no cliente, e o core é um binário de 4 MB que **não** fica no
repositório — ele é baixado no setup e conferido por SHA-256:

```bash
pnpm emulator:setup             # baixa e confere os assets do core
pnpm emulator:verify            # só confere o que já está em disco
pnpm emulator:setup --forcar    # rebaixa mesmo com o hash batendo
```

Os arquivos vão para `apps/web/public/emulator/<core>/<versão>/`, servidos pelo
próprio front. **O caminho é versionado de propósito:** save state não é
portável entre builds de core, e o `coreVersion` do adapter é derivado dessa
mesma versão. Trocar a versão em `scripts/emulador/manifesto.mjs` invalida o
save state de todos os usuários — é migração, não atualização de arquivo.

Se o hash não bater, o script falha e não instala nada. Asset de emulação vindo
de CDN é exatamente onde não se confia cegamente; o hash esperado está no
manifesto, ao lado da URL de onde o arquivo veio.

O core `snes9x2010` é **não comercial** e o RetroArch em WASM é GPLv3. As duas
obrigações estão em `scripts/emulador/LICENCAS.md`, copiado para
`/emulator/LICENCAS.md` pelo setup. Ver
[ADR 0011](adr/0011-escolha-do-runtime-de-emulacao.md).

Nada de COOP/COEP: o core não usa `SharedArrayBuffer`, então o front não precisa
ficar isolado por origem cruzada — e iframes e recursos externos continuam
funcionando.

### Verificar o emulador num navegador de verdade

`pnpm test` não sobe emulador: WebAssembly, WebGL e 4 MB de core não cabem num
teste de unidade. A prova de que o adapter carrega, roda, salva e restaura mora
num harness separado, que abre um Chrome e joga um dos homebrews do catálogo:

```bash
pnpm emulator:setup
pnpm --filter @pixelvault/emulator-runtime build
pnpm --filter @pixelvault/emulator-runtime verify:browser
```

Ele exige um Chrome instalado (`CHROME=/caminho/do/chrome` aponta para outro
binário) e sai com código 1 se `importState` não voltar ao ponto salvo, se a
SRAM do Sure Instinct não vier com 8 KB ou se sobrar `AudioContext` aberto
depois de dez ciclos de criar e destruir.

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
