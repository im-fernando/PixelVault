# 0022. Subir o banco de teste pelo compose do projeto, não por Testcontainers

Data: 2026-09-08
Status: aceita

## Contexto

A suíte de integração da API fala com PostgreSQL de verdade — é o ponto dela.
As garantias que mais importam na autenticação só existem contra banco:
unicidade sob concorrência, constraint que impede duplicata, `WHERE` que de
fato filtra. Nada disso sobrevive a um repositório falso em memória.

O que faltava não era o banco, era quem o coloca de pé. Até a issue #52,
rodar `pnpm test` na máquina de quem desenvolve pressupunha um
`docker compose up -d` feito à mão antes. Sem ele, os testes de integração
falhavam com erro de conexão do driver — não com uma mensagem que dissesse o
que fazer. Numa máquina recém-clonada, sem `.env` e sem container, a suíte
simplesmente não passava, e o critério de aceite da issue é explícito:
`pnpm test` sobe e derruba o banco sozinho e passa numa máquina limpa.

Duas formas de resolver isso, e as duas funcionam:

- **Testcontainers.** A biblioteca sobe um PostgreSQL efêmero por execução,
  isolado, e o derruba no fim. Resolve o problema por definição e ainda dá
  isolamento total entre execuções.
- **O serviço `postgres` que o `docker-compose.yml` já descreve**, subido
  pela própria suíte quando não há nada respondendo na `DATABASE_URL`.

O que pesa contra o Testcontainers aqui é o custo por execução. Ele sobe um
container **toda vez** — o preço que a nossa medição do compose frio mostrou
(cerca de 5s a mais numa máquina com a imagem já baixada, mais a espera do
`postgres` inicializar) passaria a ser pago em toda rodada, inclusive nas
dezenas de rodadas por dia em que o banco já estava de pé. A suíte da API
inteira leva ~30s; um pedágio fixo em cima disso é exatamente o caminho para
"ninguém roda localmente", que é a outra metade do que a issue pede.

O que pesa a favor do compose é o padrão que o projeto já tem: a #49 recusou
Redis porque o PostgreSQL já estava lá (ADR 0019), a #47 recusou cron, a #48
recusou uma tabela de RBAC. Testcontainers seria dependência nova e um
segundo mecanismo de subir banco, ao lado do compose que continua existindo
para `pnpm dev` e do serviço do job no CI.

E o isolamento que o Testcontainers daria de graça a suíte já resolve por
outro caminho: cada arquivo cria identidades com sufixo aleatório e apaga o
que criou (`apps/api/test/suporte/rastro.ts`). É o que permite os arquivos
rodarem em paralelo contra o mesmo banco — inclusive contra o banco de
desenvolvimento, sem apagar o catálogo de quem estava trabalhando.

## Decisão

O banco da suíte é o serviço `postgres` do `docker-compose.yml`, e quem
garante que ele está de pé é o `globalSetup` do Vitest da API
(`apps/api/test/suporte/postgres-de-teste.ts`):

1. bate na porta da `DATABASE_URL`. Se responde, não mexemos em nada — é o
   caso do compose já aberto e o do serviço `postgres` do job no CI;
2. se não responde e o endereço é local, roda
   `docker compose up -d --wait postgres` e espera o banco aceitar consulta;
3. compara as migrations do repositório com as registradas em
   `_prisma_migrations` e só chama `prisma migrate deploy` quando falta
   alguma;
4. no fim, derruba **apenas** o que ele mesmo subiu, com um
   `docker compose stop postgres`. Banco que já estava aberto continua aberto.

Sem `.env` na máquina, a `DATABASE_URL` e o `SESSION_SECRET` caem em padrões
de teste que apontam para esse mesmo serviço
(`apps/api/test/suporte/ambiente.ts`). Clonar e rodar `pnpm test` basta.

O CI perdeu o passo de `prisma migrate deploy`: quem aplica migrations agora
é a suíte, nos dois ambientes. Dois mecanismos fazendo a mesma coisa
significariam que o do CI esconderia uma quebra no que roda localmente.

## Consequências

- Numa máquina com o banco já de pé — o caso normal de quem desenvolve — o
  custo do `globalSetup` é uma conexão TCP e duas consultas. A suíte não fica
  mais lenta.
- Numa máquina limpa, `pnpm test` funciona sem passo manual, e o primeiro
  `pnpm dev` depois disso encontra o banco já migrado.
- Em compensação, os testes continuam compartilhando o banco de
  desenvolvimento, e isso é uma restrição permanente sobre como se escreve
  teste aqui: **nunca** limpar por tabela, sempre apagar o que se criou. Um
  `deleteMany` sem `where` apagaria o catálogo de quem estava trabalhando e
  quebraria os outros arquivos que rodam em paralelo. Testcontainers teria
  tirado essa armadilha do caminho.
- Depender do Docker CLI para o caminho de máquina limpa. Quem já tem um
  PostgreSQL próprio aponta a `DATABASE_URL` para ele e o `globalSetup`
  nunca chama o `docker`.
- Um teste que sujar o banco e não limpar não falha na hora: ele deixa lixo
  que só aparece depois, em outra execução. Com container efêmero isso
  sumiria sozinho no fim da rodada.
- O `globalSetup` é do projeto Vitest inteiro, não dos arquivos de
  integração: rodar só um teste de unidade da API passa a garantir o banco
  antes. Na prática custa a conexão TCP quando ele já está de pé, e evita a
  configuração de dois projetos Vitest para separar o que precisa de banco do
  que não precisa.

## Alternativas descartadas

**Testcontainers (`@testcontainers/postgresql`).** Dependência nova, e um
container por execução da suíte. Ganha isolamento total e perde os segundos
que a rodada rápida do dia a dia não tem para dar. Se um dia a suíte crescer
a ponto de o compartilhamento do banco virar fonte de teste instável — dois
arquivos disputando a mesma linha, limpeza que esquece algo —, é esta a
decisão que muda: o `globalSetup` é o único ponto que sabe de onde vem o
banco, e trocá-lo por um container efêmero não toca em nenhum cenário de
teste.

**Deixar como estava e só melhorar a mensagem de erro.** "Suba o banco antes"
é documentação, não automação: continuaria falhando numa máquina limpa, e o
critério de aceite da #52 é explícito sobre isso.

**`prisma migrate deploy` a cada execução, sem comparar antes.** Simples e
idempotente, mas custa alguns segundos de CLI em toda rodada para, quase
sempre, não fazer nada. A comparação com `_prisma_migrations` é uma consulta.

**Um banco separado só para teste (`pixelvault_test`) no mesmo serviço.**
Resolveria o compartilhamento com o banco de desenvolvimento, mas exigiria
uma segunda `DATABASE_URL` para manter em sincronia — no `.env`, no
`.env.example` e no CI —, e as migrations passariam a ser aplicadas em dois
bancos. O rastro por arquivo já resolve o problema que isso resolveria.
