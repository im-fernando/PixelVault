# 0019. Contar tentativas de autenticação no PostgreSQL

Data: 2026-09-08
Status: aceita

## Contexto

O login precisa de rate limit, e rate limit precisa de um contador em algum
lugar. A pergunta que a issue #49 obriga a responder é onde esse contador
mora — porque a resposta muda o que o limite garante:

- **Na memória do processo.** É onde está hoje o teto provisório do cadastro
  (`@fastify/rate-limit` com store padrão). Some no restart e não é
  compartilhado: com duas instâncias da API atrás de um balanceador, o teto
  efetivo vira o dobro, e um atacante que espalha requisições entre elas
  multiplica a própria cota pelo número de instâncias.
- **Num Redis.** É a resposta padrão do mercado, e ela funciona. Traz
  serviço novo no `docker-compose.yml`, dependência nova, variável de
  ambiente nova, uma peça a mais para monitorar e uma decisão a mais na hora
  de subir em produção.
- **No PostgreSQL.** Já está lá, já é a peça que todas as instâncias
  compartilham, já é onde as sessões vivem (ADR 0017) e já é obrigatório
  para o login funcionar — sem ele não há usuário para autenticar.

O volume ajuda a decidir. Este contador só é tocado nas rotas de credencial
(`/api/auth/login`, `/register`, `/change-password`), que são de baixíssima
frequência comparadas ao resto: uma linha por tentativa, com no máximo
algumas dezenas de linhas vivas por chave, contra uma requisição que já paga
~330 ms de Argon2id (docs/seguranca.md). Não é o caso de uso que faz uma
tabela sofrer.

O projeto também tem um viés registrado de não trazer infraestrutura antes de
a necessidade aparecer: a #47 resolveu a poda de sessões sem cron, a #48
resolveu papel de usuário com uma coluna em vez de um RBAC em tabela.

## Decisão

O contador vive no PostgreSQL, na tabela `auth_attempts`, com uma linha por
tentativa.

- Colunas: `scope` (login, register, change_password), `key_type`
  (ip, identifier), `key_hash` e `created_at`.
- `key_hash` é **HMAC-SHA256** do IP ou do identificador tentado, com o
  `SESSION_SECRET` como chave. A contagem só precisa de igualdade, e guardar
  o valor em claro construiria duas listas que não queremos ter: a de e-mails
  que estavam sendo atacados (existam eles como conta ou não) e a de IPs.
  HMAC e não SHA-256 puro porque e-mail e IPv4 têm entropia baixa demais para
  um hash sem segredo.
- Uma linha por tentativa, e não um contador agregado por janela: dá janela
  deslizante de verdade (contador agregado por janela fixa perdoa o dobro do
  limite na virada) e o mesmo dado serve para investigar.
- A poda é preguiçosa, como a das sessões da #47: cada gravação apaga o que
  já está mais velho que a maior janela da política. Não há cron no projeto e
  esta decisão não cria o primeiro.

A política que lê esse contador — quantas tentativas cabem, por quanto tempo
a chave bloqueada fica de fora — está em
`apps/api/src/modules/identity/domain/limite-de-tentativas.ts`, e os números
escolhidos estão justificados em [docs/seguranca.md](../seguranca.md).

O teto genérico da API inteira (300 requisições por minuto por IP, em
`app.ts`) continua em memória, com `@fastify/rate-limit`. Ele não é controle
de segurança: é higiene contra cliente desgovernado, e o pior que a natureza
por-instância dele produz é um teto N vezes maior com N instâncias.

## Consequências

Cada requisição a uma rota de credencial passa a fazer três idas ao banco
antes de chegar ao caso de uso: contar, gravar e podar. São consultas por
índice, na casa do milissegundo, contra uma rota que já gasta ~330 ms em
Argon2id — mas são três a mais, e existem.

O limite passa a valer para o sistema, não para o processo: reiniciar a API
não perdoa ninguém, e subir uma segunda instância não dobra a cota de
atacante nenhum. Em troca, o rate limit passa a depender do banco estar de
pé. Isso é aceitável aqui porque falha do banco derruba o login de qualquer
jeito (as contas estão nele), e o mecanismo falha fechado: erro ao consultar
o contador recusa a requisição, não a libera.

A tabela cresce com o abuso, e não com o uso: login que dá certo apaga a
própria linha. O limite honesto é o mesmo da limpeza de sessões — chave que
nunca mais aparece só é podada quando alguma outra tentativa acontece; se
isso virar tamanho, um `DELETE ... WHERE created_at < now() - interval`
periódico resolve, e é decisão de operação, não mudança de contrato.

Investigar "qual e-mail estava sendo atacado" deixa de ser possível pela
tabela: ela só tem HMAC. Quem investiga usa o log estruturado (que carrega o
e-mail normalizado e o IP, nunca a senha) ou calcula o HMAC de um e-mail
suspeito e consulta por ele. Rotacionar o `SESSION_SECRET` desliga as chaves
antigas — na prática, perdoa os bloqueios em curso e recomeça a contagem.

## Alternativas descartadas

**Redis.** A escolha certa se o volume fosse alto ou se o projeto já tivesse
Redis para outra coisa. Nenhuma das duas é verdade: seria um serviço novo,
uma dependência nova e uma variável de ambiente nova para resolver, em um
produto sem tráfego, um problema que a peça que já existe resolve. Se um dia
o contador virar gargalo mensurável — e o número a olhar é a latência das
consultas de `auth_attempts` — trocar o adaptador é trocar
`prisma-tentativa-repository.ts` por outro: a porta
(`domain/tentativa-repository.ts`) foi desenhada para isso.

**Manter em memória com `@fastify/rate-limit`.** É o que já existia e é o que
a issue #49 pede para consertar. Um limite de força bruta que zera no deploy
e se multiplica por instância dá a sensação de proteção sem a proteção.

**`@fastify/rate-limit` com um `store` customizado sobre o PostgreSQL.**
Considerado a sério, e é o caminho que teria mantido um mecanismo só. O
`store` do plugin é por chave única, é chamado por uma rota que não conhece o
resultado dela e não tem onde encaixar "esqueça esta tentativa porque a senha
estava certa". Duas chaves por requisição com bloqueio progressivo caberiam
ali só à força. O plugin continua no projeto fazendo o que faz bem — o teto
genérico da API.

**Contar só as tentativas que falham.** Seria o desenho óbvio, e ele tem uma
janela de corrida: um punhado de requisições simultâneas passa junto pela
verificação de senha antes de qualquer contador subir. Contamos a tentativa
antes de conferir a credencial e apagamos depois, quando ela acerta — o
resultado observável é o mesmo, sem a janela.

**Guardar o IP e o e-mail em claro na tabela.** Facilitaria a investigação e
criaria um alvo: a lista de quem estava sob ataque, com retenção indefinida,
numa tabela que ninguém lembraria de proteger. O log estruturado já atende a
investigação, com retenção de log e não de banco.

**Bloquear a conta de forma persistente após N falhas** (o "account lockout"
clássico, que exige ação humana ou e-mail para destravar). Descartado por ser
exatamente a arma que a issue pede para não construir: quem escolhe a vítima
escolhe quando ela fica de fora. O bloqueio daqui é temporário, com teto, e
some sozinho.
