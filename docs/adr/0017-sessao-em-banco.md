# 0017. Usar sessão em banco, com renovação deslizante e cookie assinado

Data: 2026-09-07
Status: aceita

## Contexto

Duas saídas para autenticação por sessão, e elas não se equivalem:

**Cookie assinado sem estado.** A sessão é o próprio cookie, assinado pelo
servidor. Nenhuma consulta ao banco para validar. Rápido, simples, escala de
graça — e impossível de revogar antes do vencimento. Deslogar de todos os
dispositivos, banir conta ou invalidar sessão após troca de senha viram
"espere o token expirar".

**Sessão em banco.** Uma tabela `sessions`, e o cookie carrega só um
identificador opaco. Uma consulta por requisição autenticada, em troca de
revogação imediata e de poder listar "onde estou logado".

A M6 vai creditar XP e playtime pelo relógio do servidor (ADR 0009, a
escrever) e alimentar ranking com isso. Sessão que não pode ser revogada é
sessão que não pode ser cortada quando o comportamento for abusivo — e o
ranking depende dessa capacidade existir desde já, não depois que o abuso
acontecer. O produto também promete múltiplos dispositivos (PC e celular);
"sair de todos os aparelhos" é expectativa razoável de quem joga assim.

`SESSION_SECRET` já existe no `.env.example`, validado em `apps/api/src/config.ts`
com mínimo de 32 caracteres, e `@fastify/cookie` já está registrado com esse
segredo em `apps/api/src/app.ts` — a infraestrutura de cookie assinado já
está pronta, independente de qual das duas estratégias vencesse aqui.

## Decisão

Sessão em banco. Tabela `sessions`:

- `id` — identificador opaco (uuid), chave primária.
- `tokenHash` — hash (SHA-256) do token que vai no cookie. Guardamos o hash,
  nunca o token em claro: um dump do banco não deve virar sequestro de sessão.
- `userId` — dono da sessão, FK para `users`, `onDelete: Cascade`.
- `createdAt`, `expiresAt`, `lastSeenAt`.
- `userAgent` — string livre, para a pessoa reconhecer o dispositivo na
  listagem de sessões (#47).
- `ipTruncated` — IP com o último octeto (IPv4) ou os últimos 80 bits (IPv6)
  zerados. Serve para localização aproximada em caso de abuso, não para
  rastreio fino.

O cookie carrega o token em claro (não o `id`); o servidor calcula o hash a
cada request e busca por `tokenHash`. Isso evita que a própria tabela de
sessões, se vazada, seja suficiente para forjar cookies válidos.

**Expiração e renovação.** Cada sessão nasce com `expiresAt` = `createdAt` +
30 dias. Em toda requisição autenticada dentro da janela de validade, se
restar menos da metade do prazo (< 15 dias), a sessão é renovada: `expiresAt`
recua para +30 dias a partir de agora, e `lastSeenAt` é atualizado. Não há
teto absoluto além disso — um dispositivo em uso constante nunca desloga
sozinho, e um abandonado expira em até 30 dias de inatividade. Não existe
"sessão de banco" com risco de operação financeira aqui; não há por que forçar
reautenticação periódica de quem está sempre ativo.

**Cookie.** `httpOnly` (sempre — o cookie nunca precisa ser lido por
JavaScript), `Secure` (sempre em produção; falso é aceito só em
`NODE_ENV=development` para permitir `http://localhost`), `SameSite=Lax`.
`Lax` porque a API e o front, mesmo em portas diferentes, são o mesmo
site (mesmo domínio registrável) — o cookie continua indo em toda
requisição same-site, inclusive `fetch` cross-origin-mesmo-site, e só fica de
fora em navegação de terceiro para POST. Isso já neutraliza CSRF clássico sem
exigir um token de CSRF separado; ainda assim, rotas que mutam estado devem
validar o header `Origin` contra a lista de origens permitidas, como defesa em
profundidade (OWASP recomenda a combinação, não uma ou outra).

**Fixação de sessão.** Não há sessão de servidor antes do login — não existe
conceito de "sessão anônima" no backend hoje; progresso pré-conta vive no
cliente (é o que a #53 vai decidir o destino). Cada login e cada cadastro
criam uma sessão nova; não há sessão pré-existente para "fixar". Login não
precisa, portanto, regenerar identificador — ele nasce novo sempre. Trocar de
senha, sim, deve revogar as sessões existentes (exceto a atual), mas isso é
escopo de #47.

## Consequências

Toda requisição autenticada passa a custar uma consulta ao banco (por
`tokenHash`, indexado, chave única). Aceitável: é uma leitura por índice
único, e o volume do produto não justifica cache de sessão agora — se algum
dia justificar, cache é decisão de infraestrutura, não muda este contrato.

Ganhamos: revogar sessão individual, "sair de todos os aparelhos", listar
sessões ativas com dispositivo e data (#47), e cortar sessão de conta banida
ou sob comportamento abusivo sem esperar expiração.

Perdemos simplicidade operacional: a tabela cresce, e sessões expiradas
precisam de limpeza periódica (job ou `DELETE ... WHERE expiresAt < now()`
rodado por cron) para não acumular indefinidamente. Fica registrado como
dívida a resolver quando M2 estiver de pé — não bloqueia o login funcionar.

## Alternativas descartadas

**JWT assinado sem estado**, guardado no cookie. Descartado porque a
impossibilidade de revogar imediatamente conflita direto com o requisito da
M6 (cortar abuso de ranking) e com a expectativa de produto de deslogar em
todos os dispositivos. Adicionar uma denylist para permitir revogação anula a
vantagem de não consultar banco — vira sessão em banco com passo a mais.

**Cookie assinado carregando o próprio `userId`** (sem tabela), com expiração
curta e refresh token separado em banco só para renovar. Mais complexo que a
sessão em banco direta para o mesmo resultado, e ainda não revoga o
access-cookie até ele expirar — só adia o problema.

**Guardar o token em claro na tabela `sessions`** em vez do hash. Descartado
porque um vazamento do banco (backup exposto, injeção de leitura) viraria
sequestro imediato de toda sessão ativa; hashear custa uma coluna e um SHA-256
por request, preço baixo por não repetir esse erro.
