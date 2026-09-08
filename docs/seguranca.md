# Segurança

Este documento existe para registrar decisões de segurança que dependem de
medição na máquina alvo — a primeira é o custo do hash de senha, issue #44.
Sem o número e o ambiente registrados, "200 a 500 ms" vira uma frase de blog
que ninguém pode conferir nem refazer quando a máquina de produção mudar.

## Hash de senha (Argon2id)

### Por que Argon2id, e por que não outro

Argon2id é o ganhador do Password Hashing Competition (2015) e a recomendação
atual da OWASP para hash de senha. bcrypt e scrypt ficaram de fora por
desenho: bcrypt trunca a entrada em 72 bytes e não tem parâmetro de memória
(fica vulnerável a ataque em GPU/ASIC, que é exatamente o que Argon2
encarece); scrypt tem parâmetro de memória mas não a variante híbrida
resistente a _side-channel_ que o "id" do Argon2id garante. SHA (com ou sem
sal) nunca esteve em consideração: é rápido demais de propósito — a
característica que faz um hash de integridade ser bom o torna péssimo para
senha.

A biblioteca usada é [`argon2`](https://www.npmjs.com/package/argon2) (binding
nativo em C, mantido, com pré-compilados para Linux/macOS/Windows). É a lib
Node mais adotada para Argon2 e a única que expõe `needsRehash` pronto — a
peça que sustenta a reidratação abaixo.

### Onde mora o código

`apps/api/src/modules/identity/infrastructure/hash-de-senha.ts`. Três funções,
sem porta/adaptador no `domain/`: a ADR
[0004](adr/0004-hexagonal-apenas-nas-integracoes-externas.md) reserva
hexagonal para pontos com mais de um adaptador plausível, e aqui não existe —
Argon2id é a decisão desta issue, não algo plugável. `domain/User` continua
recebendo um `senhaHash` já pronto e nunca importa `argon2`.

- `gerarHashDeSenha(senhaPlana)` — calcula o hash com os parâmetros atuais.
- `verificarSenha(senhaPlana, hash)` — confere sem se importar com
  parâmetros antigos.
- `verificarERehash(senhaPlana, hashAtual)` — verifica e, se a senha bater e
  o hash guardado usar parâmetros diferentes dos atuais, devolve um
  `novoHash` para o caller regravar. Quem chama é o login
  (`application/autenticar-usuario.ts`), que regrava o `novoHash` pelo
  `UserRepository` logo depois de a senha bater.

Os parâmetros usados **não precisam de coluna própria no banco**: o formato
Argon2id já os embute na string do hash
(`$argon2id$v=19$m=...,t=...,p=...$salt$hash`), então `needsRehash` compara
os parâmetros ali dentro contra a constante `PARAMETROS_ATUAIS` do módulo.

### Calibração — medida nesta máquina, não copiada

Meta da issue: 200–500 ms por hash. Abaixo de 200 ms facilita força bruta
offline caso o hash vaze; acima de 500 ms, cada tentativa de login já é cara
o bastante para virar vetor de negação de serviço sozinha — o rate limit da
issue #49 é a segunda linha de defesa, não a primeira, então o hash não pode
depender dele para ser seguro.

**Ambiente da medição** (7 de setembro de 2026):

| Item     | Valor                          |
| -------- | ------------------------------ |
| CPU      | 16 threads (`nproc`)           |
| RAM      | 15 GiB total                   |
| Sistema  | Linux 7.0.0-30-generic, x86_64 |
| Node.js  | v24.19.0                       |
| `argon2` | 0.45.1                         |

**Candidatos testados** (5 repetições cada, `argon2id`, senha de calibração
de 38 caracteres):

| memória (m) | iterações (t) | paralelismo (p) | média medida |
| ----------- | ------------- | --------------- | ------------ |
| 19 MiB      | 2             | 1               | 33,6 ms      |
| 46 MiB      | 1             | 1               | 62,0 ms      |
| 64 MiB      | 2             | 1               | 127,1 ms     |
| 64 MiB      | 3             | 1               | 184,4 ms     |
| **128 MiB** | **2**         | **1**           | **279,8 ms** |
| 128 MiB     | 3             | 1               | 399,0 ms     |
| 128 MiB     | 2             | 2               | 212,9 ms     |
| 256 MiB     | 2             | 1               | 591,5 ms     |
| 256 MiB     | 1             | 2               | 253,4 ms     |

**Escolha:** `m=131072` (128 MiB), `t=2`, `p=1`. Dez execuções adicionais só
com essa configuração deram média de **332,6 ms** (mínimo 286,6 ms, máximo
424,6 ms) — confortavelmente dentro dos 200–500 ms, sem encostar em nenhuma
das duas bordas.

`p=1` foi escolhido em vez de `p=2` de propósito: o paralelismo do Argon2
soma-se ao paralelismo natural do servidor (várias requisições de login
concorrentes já disputam os mesmos núcleos). Usar `p=1` mantém o custo por
hash previsível e não multiplica a contenção quando o login vira alvo de
tráfego concentrado — o cenário de negação de serviço que a nota da issue
pede para não piorar.

Exemplo de hash produzido com esses parâmetros (senha e salt de calibração,
descartáveis):

```
$argon2id$v=19$m=131072,p=1,t=2$TA94O+Kdh5fMRmXqRBSzvA$YypBGINoJhRfBI+5u6Us7mLzOvzlxK+584B3V2wopvg
```

### Reidratação

Testada em `hash-de-senha.test.ts`: um hash calculado com parâmetros mais
fracos (`m=19456,t=2,p=1`, simulando um registro anterior a uma futura
calibração) é aceito pela verificação e vem acompanhado de um `novoHash` — e
o `novoHash`, por sua vez, não pede nova reidratação. Isso é o que permite
subir o custo do Argon2id no futuro sem invalidar nenhuma senha existente:
cada login bem-sucedido migra silenciosamente quem ainda está no hash velho.

A reidratação só roda **depois** que `argon2.verify` já confirmou a senha
certa — uma tentativa de força bruta com senha errada nunca aciona
`needsRehash` nem paga o custo de calcular um hash novo.

### Como reproduzir

```bash
cd apps/api
node -e "
import('argon2').then(async ({ default: argon2 }) => {
  const senha = 'senha-de-calibracao-bem-comprida-1234';
  const opts = { type: argon2.argon2id, memoryCost: 131072, timeCost: 2, parallelism: 1 };
  const t0 = performance.now();
  await argon2.hash(senha, opts);
  console.log(performance.now() - t0, 'ms');
});
"
```

Repita em qualquer máquina nova (em especial a de produção) antes de confiar
nestes números — `nproc` e RAM diferentes mudam o tempo, e a régua de 200–500
ms vale para a máquina de destino, não para esta.

## Login indistinguível (anti-enumeração de contas)

A issue #46 fechou a segunda porta de enumeração de usuários — a primeira,
o cadastro, está documentada no cabeçalho de
`application/registrar-usuario.ts`. O ataque é simples: sem cuidado, o login
responde "e-mail não cadastrado" de um jeito e "senha errada" de outro, e
qualquer pessoa varre uma lista de e-mails descobrindo quem tem conta aqui —
sem nunca acertar uma senha. Numa biblioteca de jogos com perfil público,
isso é a lista de quem usa o produto, entregue de graça.

Fechar essa porta exige três coisas ao mesmo tempo. Faltando uma, as outras
duas não valem nada:

1. **Mesmo código.** `CREDENCIAIS_INVALIDAS` para os dois casos, traduzido
   para `UNAUTHENTICATED` com status 401.
2. **Mesma mensagem e mesmo corpo.** "E-mail ou senha incorretos",
   literalmente a mesma string, com os mesmos `details`.
3. **Mesmo tempo.** A que costuma faltar.

### O hash descartável

O item 3 é o difícil. O caminho "achei o usuário" roda um `argon2.verify`
(~330 ms nesta máquina, ver a seção acima); o caminho "não achei" não teria
o que verificar e responderia em poucos milissegundos. A diferença é da
ordem de 100% do custo da requisição — não precisa de estatística para
enxergar, um `curl` com `time` já separa conta existente de inexistente.

A solução é a constante `HASH_DESCARTAVEL`, em
`apps/api/src/modules/identity/infrastructure/hash-de-senha.ts`: o hash
Argon2id de uma senha aleatória de 32 bytes, gerada uma vez e descartada
imediatamente. Quando o e-mail não tem conta, a senha oferecida é verificada
contra ele. O resultado é sempre falso, e o custo é exatamente o de uma
verificação real — porque o custo de um `argon2.verify` vem dos parâmetros
embutidos na própria string do hash, e essa string foi gerada com
`PARAMETROS_ATUAIS`.

Não é segredo, e por isso está versionada no código: é o hash de uma senha
que ninguém nunca soube. Ficar fixa (em vez de ser gerada a cada boot) mantém
todas as instâncias da API com o mesmo custo e deixa auditável contra o quê
se está verificando.

**A armadilha da manutenção:** recalibrar o Argon2id sem recalcular esta
constante reabre a fresta em silêncio — o hash antigo verificaria com os
parâmetros antigos, mais baratos, e a diferença de tempo voltaria.
`hash-de-senha.test.ts` guarda a invariante com `needsRehash`, então o
esquecimento quebra o build. Para gerar um novo:

```bash
cd apps/api
node -e "
Promise.all([import('argon2'), import('node:crypto')]).then(async ([{ default: argon2 }, { randomBytes }]) => {
  const senha = randomBytes(32).toString('base64url');
  console.log(await argon2.hash(senha, { type: argon2.argon2id, memoryCost: 131072, timeCost: 2, parallelism: 1 }));
});
"
```

### O que mais paga o pedágio

O caso de uso não tem nenhum retorno antecipado antes do `verificar`. Até
e-mail malformado — que jamais seria uma conta — passa pela busca e pelo
Argon2: recusar cedo criaria um terceiro tempo de resposta, distinguível dos
outros dois.

O que **não** é indistinguível, de propósito: sucesso e fracasso. Quem
acertou a senha recebe 200 e um cookie de sessão; quem errou recebe 401.
Esconder isso seria esconder o próprio login.

### A medição

O critério de aceite da issue pede medir, não supor.
`apps/api/test/login.integration.test.ts` roda 8 repetições de cada caminho
contra o PostgreSQL real, alternando a ordem (para que uma eventual deriva da
máquina não caia toda do mesmo lado) e depois de duas requisições de
aquecimento (a primeira chamada ao binding nativo do Argon2 e o primeiro
plano de consulta do Postgres pagam um pedágio que não é do teste).

Medição desta máquina, 7 de setembro de 2026:

| caminho            | média medida |
| ------------------ | ------------ |
| senha errada       | 283,3 ms     |
| e-mail inexistente | 294,1 ms     |
| **diferença**      | **10,7 ms**  |

10,7 ms sobre um custo médio de 288,7 ms — 3,7% do tempo da requisição. O
limiar do teste é 25% do custo médio (~72 ms): folgado o bastante para não
piscar em CI ruidoso, e ainda quatro vezes menor que o sinal (~100% do custo)
que denunciaria o Argon2 tendo sido pulado.

O hash caro e a resposta uniforme não impedem tentativa em massa; só
encarecem cada tentativa. Quem impede está na seção "Rate limit e defesa
contra força bruta", abaixo.

## Sessão em cookie

A estratégia está na [ADR 0017](adr/0017-sessao-em-banco.md); o que interessa
registrar aqui é o desenho do cookie, escolhido na #46:

- **Nome:** `pv_sessao`.
- **`httpOnly`:** sempre. JavaScript nunca lê o token, então um XSS no front
  deixa de ser roubo de sessão silencioso.
- **`Secure`:** sempre, exceto com `NODE_ENV=development` — `http://localhost`
  não receberia um cookie `Secure` de volta.
- **`SameSite=Lax`:** front e API compartilham o domínio registrável, então o
  cookie acompanha toda requisição same-site e fica de fora de POST disparado
  por site de terceiro.
- **Assinado** com `SESSION_SECRET`. Não é o que torna o token inforjável (256
  bits aleatórios já fazem isso): serve para descartar cookie adulterado sem
  gastar uma consulta ao banco.

O prefixo `__Host-` foi considerado e descartado: ele obriga `Secure`, e ter
um nome de cookie em produção e outro em desenvolvimento colocaria os dois
ambientes em caminhos de código diferentes justamente na peça de
autenticação. As garantias que o prefixo daria (`Path=/`, sem `Domain`) estão
explícitas nas opções do cookie.

O token que vai no cookie é 32 bytes aleatórios em base64url, e o banco
guarda apenas o SHA-256 dele. SHA-256 e não Argon2 porque o token já é 256
bits de aleatoriedade — não há dicionário para atacar, e um hash lento aqui
custaria latência em toda requisição autenticada.

## Revogação de sessões

Desenhado na #47. As rotas são `POST /api/auth/logout`,
`GET /api/auth/sessions`, `DELETE /api/auth/sessions/:id` e
`POST /api/auth/sessions/revoke-others`. A listagem devolve id, user-agent, IP
truncado, `createdAt`, `lastSeenAt` e uma marca de qual é a sessão atual —
nunca o token nem o hash dele.

### `DELETE /sessions/:id` responde 404 para o que não é seu

Sessão de outra pessoa e id que não existe recebem exatamente a mesma
resposta: 404, mesmo corpo, mesmo código. Um 403 no primeiro caso seria a
resposta "certa" pelo livro de HTTP e entregaria de graça a informação de que
aquele id existe — que é justamente o que alguém varrendo ids de sessão
alheia quer descobrir.

A garantia não depende de disciplina de quem escreve a rota: o `userId` entra
no mesmo `WHERE` do `id`, no `deleteMany`. Não há nenhum ponto do fluxo em que
o código tenha em mãos a informação "existe, mas é de outro" — ele só sabe
quantas linhas caíram. Ler a linha antes para conferir o dono seria o desenho
que abre a porta para o 403 aparecer numa refatoração futura.

### Trocar a senha derruba os outros aparelhos

`POST /api/auth/change-password` exige as duas provas: o cookie de sessão **e**
a senha atual. Só o cookie faria de qualquer máquina destravada um sequestro
permanente da conta — bastaria trocar a senha. Em caso de sucesso, todas as
outras sessões da conta são revogadas e a que fez a troca sobrevive: quem
acabou de provar que sabe a senha atual não deve ser punido com um logout.

Senha atual incorreta responde 422, não 401. 401 significa "sua sessão não
vale", e é assim que o front o trata — deslogaria quem apenas errou a
digitação da senha antiga.

Este endpoint não é o "esqueci minha senha" (#51), que é para quem não sabe a
senha e não está logado.

### Limpeza de sessões expiradas: preguiçosa, não por cron

A ADR 0017 registrou a poda da tabela `sessions` como dívida. A #47 a resolve
de forma preguiçosa, em dois pontos:

1. **Ao resolver uma sessão vencida** (`resolver-sessao.ts`): a linha é
   apagada em vez de apenas recusada. Recusar e deixar no banco só garante que
   ela seja recusada de novo amanhã.
2. **Ao listar as sessões de alguém** (`listar-sessoes.ts`): as vencidas
   daquele usuário são apagadas antes de a lista ser montada.

Preguiçosa e não um job por duas razões. A primeira é que **corretude não
depende da poda**: sessão vencida já era recusada antes desta issue existir, e
um cron atrasado nunca deixaria uma sessão morta autenticar ninguém — podar é
higiene da tabela, não regra de segurança. A segunda é que o custo fica onde a
informação está: o `DELETE` é por `user_id` indexado e roda numa rota que a
pessoa abriu justamente para ver e limpar as próprias sessões, enquanto um job
global varreria a tabela inteira para o mesmo efeito. Não existe
infraestrutura de cron no projeto, e montar a primeira por causa disto seria
caro pelo que se ganha.

O limite honesto: sessão de quem nunca mais volta não é podada por ninguém. Se
a tabela virar problema de tamanho, um `DELETE ... WHERE expires_at < now()`
periódico resolve — e é decisão de operação, não mudança de contrato.

## Rate limit e defesa contra força bruta

Desenhado na #49. O hash caro do Argon2id encarece cada tentativa; ele não
impede tentativa em massa — e, por ser caro, transforma o login num alvo
barato de negação de serviço: o atacante gasta uma requisição, o servidor
gasta ~330 ms de CPU. Rate limit é a segunda linha, e é ela que resolve os
dois problemas.

**Onde o contador vive** é decisão de arquitetura e está na
[ADR 0019](adr/0019-contador-de-tentativas-no-postgresql.md): PostgreSQL,
tabela `auth_attempts`, uma linha por tentativa, chave mascarada por HMAC. O
resto desta seção é o que a ADR não decide — os números e o desenho do
bloqueio.

### Dois eixos, e um não substitui o outro

Cada tentativa é contada duas vezes: pelo **IP** de onde saiu e pelo
**identificador tentado** (o e-mail digitado no login e no cadastro; o
`userId` da sessão na troca de senha). Nenhum dos dois basta sozinho:

- **Só por IP** não enxerga o ataque distribuído — mil IPs tentando dez
  senhas cada contra uma conta só passam por baixo de qualquer teto por
  origem.
- **Só por identificador** entrega uma arma: quem escolhe a vítima escolhe
  quando ela fica de fora, bastando errar a senha dela de propósito.

O identificador é o e-mail tentado, e não o usuário encontrado — antes do
login não se sabe quem é, e consultar para descobrir criaria um oráculo de
enumeração. O e-mail é normalizado exatamente como o login o normaliza
(`Email.chaveDeBusca`), senão alternar maiúsculas daria um balde novo a cada
variação da mesma conta.

### Os parâmetros

| escopo         | eixo          | limite | janela | bloqueio inicial | teto do bloqueio |
| -------------- | ------------- | ------ | ------ | ---------------- | ---------------- |
| login          | IP            | 20     | 15 min | 1 min            | 30 min           |
| login          | identificador | 25     | 15 min | 1 min            | 15 min           |
| cadastro       | IP            | 5      | 10 min | 5 min            | 30 min           |
| cadastro       | identificador | 10     | 10 min | 5 min            | 30 min           |
| troca de senha | IP            | 20     | 15 min | 1 min            | 30 min           |
| troca de senha | identificador | 5      | 15 min | 1 min            | 15 min           |

A escolha que mais importa é o teto por identificador ser **maior** que o
teto por IP nas duas rotas abertas ao público, com a mesma janela. É isso que
impede o limite por conta de virar arma: um atacante sozinho esbarra no
próprio teto (20 no login) antes de encostar no teto da vítima (25), porque o
bloqueio progressivo do IP só o deixa emendar mais três ou quatro tentativas
dentro dos mesmos quinze minutos. Bloquear a conta de alguém escolhido passa
a exigir mais de um IP. O teste de unidade de
`limite-de-tentativas.ts` guarda essa invariante.

E, mesmo quando o bloqueio por conta acontece, o dano é limitado por
construção: ele dura no máximo 15 minutos, não derruba nenhuma sessão que a
pessoa já tenha aberta (quem está logado continua logado) e não toca na
recuperação de senha (#51). O que ele nega é abrir uma sessão nova, por
alguns minutos.

Vinte e cinco erros em quinze minutos também está longe de quem só digitou
errado — três, quatro — e perto de zero para quem adivinha: com a política de
12 caracteres, 2.400 tentativas por dia não chegam a lugar nenhum.

A **troca de senha** inverte a assimetria de propósito. Ali o identificador é
o `userId` de quem já provou ser dono da conta pelo cookie, então ninguém de
fora consegue gastar a cota alheia — cinco erros em quinze minutos é seguro
justamente por ser estreito.

O **cadastro** conta toda requisição, e não só as que falham, porque ele
responde igual para conta criada e para e-mail já cadastrado: não existe
falha observável para contar. O teto por e-mail é generoso porque apertá-lo
só daria a alguém o poder de impedir um desconhecido de criar conta com o
próprio e-mail.

### Bloqueio temporário que dobra, não atraso na resposta

Estourado o limite, a chave fica de fora por 1 minuto; cada tentativa
excedente dobra a espera (2, 4, 8…) até o teto do escopo. Erro humano quase
nunca chega lá; insistência curta custa um minuto; insistência longa custa
cada vez mais — e nunca vira trava permanente.

A outra receita clássica — segurar a resposta por alguns segundos — foi
descartada pelo mesmo motivo que o Argon2id ficou em `p=1`: requisição
pendurada ocupa conexão e event loop, então "atrasar o atacante" é atrasar o
servidor junto. Recusar rápido com `retry-after` custa quase nada e diz ao
cliente honesto exatamente quando voltar.

### A tentativa é contada antes de a senha ser conferida

Duas consequências, e a segunda é o preço da primeira.

A boa: não existe janela de corrida. Contar só o fracasso deixaria um punhado
de requisições simultâneas passar junto pelo Argon2id antes de qualquer
contador subir. Aqui a linha é gravada antes, e **apagada depois** quando a
credencial se prova correta — do identificador, tudo; do IP, só a linha
daquela requisição. Login que dá certo não consome cota de ninguém, o que
mantém um escritório inteiro atrás do mesmo NAT longe do limite; e zerar o
eixo do IP por inteiro no sucesso não serve, porque bastaria ao atacante ter
uma conta própria e logar nela entre as tentativas para limpar o rastro.

A ruim: enquanto o bloqueio por identificador vale, **nem a senha certa
passa**. Liberar quem acerta significaria conferir a senha antes de aplicar o
limite — e aí o limite não limitaria adivinhação nenhuma, que é a única coisa
que ele existe para limitar. O preço é a espera com teto, descrita acima.

A contagem acontece em `preValidation`, antes da validação do schema: corpo
malformado também conta contra o IP. Se não contasse, mandar corpo lixo seria
requisição de graça — e mil delas, um flood de graça.

### Cabeçalhos e código de erro

Toda resposta das rotas de credencial carrega `ratelimit-limit`,
`ratelimit-remaining` e `ratelimit-reset` (em segundos), pelo eixo mais
apertado dos dois; o 429 carrega também `retry-after`. São os nomes do
rascunho de padrão da IETF, sem o `x-`, para não colidirem com os
`x-ratelimit-*` que o `@fastify/rate-limit` emite pelo teto genérico da API
(300 requisições por minuto por IP, em memória, descrito na ADR 0019).

O corpo do 429 é o `ApiError` de sempre, com `code: RATE_LIMITED` — o mesmo
código desde a #45. Qual dos dois eixos cortou vai em
`details.rateLimit`, como `LIMITE_POR_IP` ou `LIMITE_POR_IDENTIFICADOR`. Não
viramos isso em dois `ErrorCode` porque o código é o que o cliente usa para
decidir o que fazer, e a decisão é a mesma nos dois casos: esperar o que o
`retry-after` mandar. O que muda é a mensagem que a pessoa precisa ler, e
mensagem não é fluxo. Também não vaza nada: o eixo do identificador conta o
e-mail tentado exista ele ou não como conta.

### O registro de tentativa recusada

Toda resposta 4xx de rota de credencial vira uma linha de log estruturado
(`pino`, que já é o logger do projeto), com `evento`,`escopo`, `resultado`,
`ip` e `identificador` — o e-mail normalizado, ou o `userId` na troca de
senha. Com o `reqId` que o Fastify já põe em toda linha, dá para reconstruir
uma investigação: de onde veio, contra quem, quantas vezes, quando.

**A senha tentada não entra em lugar nenhum.** Não é passada para a função
que loga, não aparece em erro (nem o `DomainError`, nem o `ApiError` que vai
ao cliente carregam campo de senha) e não vai para a tabela, que só guarda
HMAC. Por precaução, o logger ainda declara `redact` para `password`,
`currentPassword`, `newPassword` e para o corpo da requisição — o serializer
padrão do Fastify não loga corpo, e a redação é a rede para o dia em que
alguém pendurar um objeto inteiro num log de depuração.

A divisão entre o que vai para o log e o que vai para a tabela é deliberada:
log é operacional, tem retenção curta e existe para quem está investigando um
incidente; a tabela é durável e não deve virar, com o tempo, a lista de quem
foi alvo.

### O que fica de fora, e por quê

As rotas de sessão — `POST /api/auth/logout`, `GET /api/auth/sessions`,
`DELETE /api/auth/sessions/:id`, `POST /api/auth/sessions/revoke-others` —
não têm rate limit próprio. Todas exigem cookie de sessão válido, então
nenhuma é superfície de adivinhação de credencial: quem chega nelas já provou
quem é, e o que ele pode fazer ali é revogar as próprias sessões. Aplicar o
regime do login a elas custaria consultas ao banco em toda navegação para
proteger de um abuso que não existe. Elas ficam sob o teto genérico da API,
que é o suficiente para cliente desgovernado.

`GET /api/auth/me` fica de fora pela mesma razão, com um motivo a mais: ela é
chamada em toda abertura de tela do front.

### Cuidado de operação: `trustProxy`

O contador por IP usa `request.ip`. Com a API atrás de um proxy ou CDN e sem
`trustProxy` configurado no Fastify, `request.ip` é o endereço do proxy — e
aí todos os usuários compartilham o mesmo balde, o limite por IP corta todo
mundo junto e o eixo deixa de significar o que promete. O mesmo cuidado vale
para o `ipTruncated` das sessões. Ligar `trustProxy` faz parte de colocar
isto em produção atrás de qualquer coisa.

## Recuperação de senha

Desenhada na #51. O provedor de e-mail e a decisão de não verificar endereço
no cadastro estão na [ADR 0021](adr/0021-usar-resend-para-email-transacional.md);
o que interessa registrar aqui é o desenho do fluxo.

São duas rotas: `POST /api/auth/forgot-password` pede o link e
`POST /api/auth/reset-password` troca a senha com ele.

### O token

32 bytes aleatórios (`randomBytes`) em base64url, exatamente como o token de
sessão — e pelo mesmo motivo: ele não carrega informação nenhuma, não tem
estrutura para adivinhar, e quem o tem, tem a conta. Aqui a comparação é ainda
mais direta que na sessão: **este token é a prova de identidade**. Quem acerta
um entra numa conta sem nunca ter sabido a senha dela.

O banco guarda apenas o **SHA-256** dele, em `password_reset_tokens`. SHA-256
e não Argon2 pela mesma razão da sessão (256 bits aleatórios não têm
dicionário a atacar); hasheado e não em claro pela razão que a issue nomeia:
um dump da tabela não pode virar redefinição de senha alheia. Depois do envio,
o valor em claro existe num lugar só do mundo — a caixa de entrada de quem
pediu.

Tabela própria, e não uma linha em `sessions`: uma sessão autentica quem já
provou saber a senha; este token _é_ a prova, e vale uma vez só. Reaproveitar
a tabela faria um token de e-mail valer como cookie.

### Validade: 30 minutos

O prazo é uma janela de sequestro de conta. Quem tiver o link nesse intervalo
— porque leu por cima do ombro, porque a caixa está aberta numa máquina
compartilhada, porque um encaminhamento automático o copiou — vira dono da
conta. Um dia inteiro, que é o padrão de muito produto por aí, transforma um
descuido de manhã num problema de noite.

Curto demais, por outro lado, castiga quem se comporta normalmente: o e-mail
leva alguns segundos (às vezes minutos), e muita gente pede a redefinição no
computador para abrir o link no celular. Quinze minutos deixaria essa pessoa
de fora com frequência, e cada expiração vira um e-mail novo — mais custo e
mais chance de o filtro de spam concluir o óbvio.

Trinta minutos é o meio. A constante está no **contrato**
(`VALIDADE_DO_TOKEN_DE_RECUPERACAO_MS`) e não escondida no servidor, porque a
tela de confirmação diz esse prazo para a pessoa — e as duas não podem
discordar.

### Uso único de verdade

Gastar o token é **um comando só**:
`DELETE ... WHERE token_hash = $1 AND expires_at > $2 RETURNING user_id`. Ler,
validar e apagar em três passos deixaria duas requisições simultâneas com o
mesmo token passarem juntas pela validação, e o "uma vez só" viraria "uma vez
só, quase sempre". Com o `DELETE`, o PostgreSQL trava a linha e exatamente uma
das duas leva o `RETURNING`.

O mesmo comando resolve os três "não vale": inexistente, já gasto e vencido
são zero linhas afetadas, indistinguíveis por construção — e não por
disciplina de quem escreve a rota. O contrato tem um código só para os três
(`TOKEN_INVALIDO`), porque separá-los diria a quem tem um token roubado se
vale a pena insistir, e diria ao dono da conta que alguém gastou o link dele
antes do clique.

### A ordem dos passos, que é onde mora a segurança

1. **Política de senha.** Roda antes de o token ser gasto, por gentileza: quem
   escolheu uma senha fraca precisa poder tentar de novo no mesmo link, sem
   pedir outro e-mail para consertar a própria digitação.
2. **Gastar o token.**
3. **Só então o Argon2id.** O hash custa ~330 ms, e esta é uma rota aberta,
   sem sessão. Se ele viesse antes da validação do token, qualquer pessoa
   queimaria CPU do servidor mandando token lixo. Pagando-o só depois de um
   token válido, o custo fica atrás de 256 bits que ninguém adivinha — e é por
   isso que `reset-password` **não** precisa de contador próprio de
   tentativas, ficando sob o teto genérico da API.
4. **Invalidar os outros tokens da conta** e **revogar todas as sessões**.

### Todas as sessões, sem exceção

`reset-password` derruba **todas** as sessões da conta. É o oposto da troca de
senha autenticada, que preserva a que fez a troca — e a diferença não é
inconsistência: lá quem pediu está logado e acabou de provar que sabe a senha
atual; aqui quem pediu não está logado, não há "sessão atual" a preservar, e o
caso que motiva o fluxo é justamente o de expulsar quem está dentro
indevidamente. Uma sessão sobrevivente aqui manteria dentro exatamente quem se
está tentando expulsar.

A operação é do módulo `sessions` (`revogarTodasAsSessoes`), com método
próprio em vez de `revogarOutras` com um id inventado: as duas têm
autorizações diferentes — uma exige cookie, a outra acontece sem nenhum — e
merecem nomes diferentes.

### Resposta indistinguível, inclusive no relógio

`forgot-password` responde **202 com o mesmo corpo**, exista a conta ou não.
As três peças, como no cadastro (#45) e no login (#46):

1. **Não há `SELECT` por e-mail.** A existência da conta é decidida dentro do
   banco, no mesmo comando que grava o token
   (`INSERT ... SELECT ... WHERE u.email = $1`). Um `SELECT` isolado colocaria
   a informação "esta conta existe" numa variável, e variável assim mais cedo
   ou mais tarde vira `if`.
2. **Sem retorno antecipado.** Nem para e-mail malformado: a normalização
   aceita qualquer texto e o banco responde "nenhuma linha", que é o mesmo
   caminho de um e-mail válido sem conta. Recusar cedo criaria um terceiro
   tempo de resposta.
3. **O envio não é esperado.** O e-mail sai por fora da requisição. Se a rota
   esperasse o provedor responder (centenas de milissegundos de rede), o
   caminho "existe conta" ficaria visivelmente mais lento que o outro, e um
   cronômetro desfaria os itens 1 e 2 — o mesmo ataque que o
   `HASH_DESCARTAVEL` do login existe para impedir.

Aqui **não** dá para igualar os dois lados pagando o custo nos dois, como o
login faz com o hash descartável: mandar e-mail para um endereço sem conta só
para gastar o mesmo tempo transformaria a API num disparador de mensagem para
qualquer endereço que alguém digitasse. O preço da escolha é que falha de
entrega vira log do servidor, nunca resposta de erro — o que se quer de
qualquer forma, já que "não consegui mandar" só é dizível para quem tem conta.

O e-mail em si também não conta nada: não trata a pessoa pelo nome nem cita o
handle, porque quem lê pode não ser o dono da conta.

### Rate limit: o único escopo em que a assimetria se inverte

| escopo               | eixo          | limite | janela | bloqueio inicial | teto do bloqueio |
| -------------------- | ------------- | ------ | ------ | ---------------- | ---------------- |
| recuperação de senha | IP            | 5      | 15 min | 5 min            | 30 min           |
| recuperação de senha | identificador | 3      | 60 min | 15 min           | 30 min           |

Nos outros escopos públicos o teto por identificador é **maior** que o do IP,
para o limite por conta não virar arma contra o dono dela. Aqui é o contrário,
de propósito: o que se limita não é adivinhação de credencial, é **gasto**.
Cada requisição que encontra conta manda uma mensagem que custa dinheiro no
provedor e um pedaço da reputação do nosso domínio — caixa de entrada inundada
de "esqueci minha senha" que ninguém pediu vira marcação de spam, e marcação
de spam derruba a entrega de todo mundo.

O preço é conhecido e aceito: quem quiser pode negar a recuperação de uma
conta escolhida por até meia hora (o teto de bloqueio de todos os escopos).
Isso é um aborrecimento — a pessoa espera, ou entra normalmente se lembrar da
senha — enquanto a caixa de entrada bombardeada e a reputação queimada não têm
volta. E aqui não existe o dano que a assimetria protege no login: este
contador não derruba sessão nem impede ninguém de entrar.

Três por hora é folgado para o comportamento honesto: o link vale 30 minutos,
então um segundo pedido dentro da mesma hora já é raro, e um terceiro
raríssimo.

O contador **nunca esquece no sucesso**, como o do cadastro e pelo mesmo
motivo: não existe sucesso observável para contar. Se ele zerasse quando a
conta existe, o próprio cabeçalho `ratelimit-remaining` viraria o oráculo que
o resto do fluxo evita — bastaria comparar a resposta de dois e-mails.

### O link do e-mail

Montado a partir de `WEB_ORIGIN`, que é configuração, **nunca** do cabeçalho
`Host` ou `X-Forwarded-Host` da requisição. Montá-lo a partir de um cabeçalho
deixaria qualquer pessoa escolher para onde aponta o link de redefinição de
outra — envenenamento de link de redefinição, dos ataques mais baratos que
existem contra este fluxo.

## O que falta

- **Poda das sessões de quem nunca mais volta** — ver acima: a limpeza
  preguiçosa não alcança quem nunca mais aparece.
- **Poda das tentativas de quem nunca mais volta** — mesma forma e mesmo
  limite: a poda de `auth_attempts` é preguiçosa (ADR 0019).
- **Poda dos tokens de redefinição de quem nunca mais volta** — a de
  `password_reset_tokens` é preguiçosa igual, pendurada no próprio
  `forgot-password`. O token esquecido já não vale (a validade está no
  `WHERE`), então é higiene de tabela e não regra de segurança.
- **Verificação de e-mail no cadastro** — a conta continua utilizável sem
  ela, e é decisão registrada na [ADR 0021](adr/0021-usar-resend-para-email-transacional.md),
  com os dois gatilhos que devem reabri-la.
- **Aviso de "sua senha foi alterada"** — o segundo e-mail transacional é a
  defesa contra redefinição silenciosa por quem já controla a caixa de
  entrada. Ele só faz sentido depois da verificação de e-mail (mandá-lo para
  endereço não verificado é exatamente o que queima reputação de domínio),
  então os dois andam juntos, na mesma issue futura.
