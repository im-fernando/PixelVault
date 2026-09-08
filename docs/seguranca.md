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

Rate limit no login continua fora daqui — é a #49. O hash caro e a resposta
uniforme não impedem tentativa em massa; só encarecem cada tentativa.

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

## O que falta

- **Rate limit no login e nas rotas de sessão** (#49) — o hash caro reduz o
  dano de um vazamento de banco, mas não impede tentativa em massa contra o
  endpoint; rate limit é quem faz isso.
- **Poda das sessões de quem nunca mais volta** — ver acima: a limpeza
  preguiçosa não alcança quem nunca mais aparece.
