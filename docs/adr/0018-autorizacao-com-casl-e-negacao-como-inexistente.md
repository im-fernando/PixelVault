# 0018. Autorizar com CASL e negar recurso alheio como inexistente

Data: 2026-09-07
Status: aceita

## Contexto

Autenticação e autorização são coisas diferentes, e a M2 acabou de resolver a
primeira: o módulo `sessions` diz **quem** está pedindo (`request.userId`), e
nada no código diz **o que** essa pessoa pode. Falta o segundo passo antes que
`library` (M3) e `progress` (M4) comecem a expor recurso de alguém.

O risco desta decisão não é técnico. É de escopo: modelar permissão é um poço
sem fundo, e o produto de hoje tem pouquíssimas regras reais — dono lê e
escreve o próprio acervo, o próprio progresso e o próprio perfil; qualquer um
lê o catálogo de metadados e joga homebrew; `admin` administra o catálogo. Só
isso.

Há também uma armadilha específica de BYOR (ADR 0006): a biblioteca de alguém
é privada, e responder "403, existe mas não é seu" para um id alheio confirma
que aquele id existe. Quem varre ids não deveria arrancar nem essa
informação — o `sessions` já tratou o caso equivalente na revogação de sessão.

## Decisão

**CASL, com as regras vivendo no `identity`.** O módulo é dono da conta e do
papel dela, então é dele a política. `identity/domain/habilidades.ts` tem a
lista inteira de regras — não há regra escrita em nenhum outro lugar — e a
fachada (`identity/index.ts`) exporta o que os outros módulos usam:
`habilidadesDoUsuario(request.userId)`, `recurso(...)` e os dois helpers de
negação. Nenhum módulo importa as tripas do `identity` (ADR 0003).

**Papel no banco: `user` e `admin`, padrão `user`.** Dois valores, uma coluna,
sem tabela de papéis nem de permissões. Papel granular, moderação e time ficam
de fora até existir a necessidade que os justifique.

**Negar por padrão.** Só existem regras de `can`. O CASL nega tudo que não foi
explicitamente permitido, então rota nova sem regra correspondente já recusa
por omissão. Não escrevemos `cannot` amplos simulando um allowlist ao
contrário — isso inverteria o padrão e passaria a permitir por esquecimento.

**Negação por propriedade responde 404; negação por permissão responde 403.**
São dois casos diferentes:

- Sobre um recurso específico ("esta biblioteca não é sua"), a resposta é a
  mesma de "não existe" — mesmo status, mesmo código, mesmo texto. É o que
  `autorizarOuNaoEncontrado(habilidades, acao, recurso, nome)` faz, lançando o
  mesmo `NotFoundError` que uma busca vazia produziria.
- Sobre uma ação sem recurso envolvido ("você não administra o catálogo"), a
  resposta é 403. Não há existência a esconder, e um 404 mentiria dizendo que
  a rota não existe. É o `autorizarOuProibido`.

O padrão que `library` e `progress` vão seguir em toda rota de recurso de
alguém é: buscar o recurso, checar a habilidade **contra ele** e, quando a
checagem falhar, responder como se o recurso não existisse. Checar contra o
nome do tipo (`'Library'`) não serve: no CASL isso pergunta "pode em alguma?",
e a resposta é sim, na dele. A assinatura do helper só aceita o recurso
justamente para impedir a pergunta errada.

**A mesma definição no front, por `GET /api/auth/abilities`.** A rota devolve
`ability.rules` — o formato serializável nativo do CASL — para quem chamou,
com ou sem sessão (sem sessão, as regras do visitante). O front joga o array
em `createAbility` e obtém a mesma `Ability` que o servidor usa.

A máquina de montar `Ability` (tipos, `createAbility`, `abilityResource`) mora
em `@pixelvault/contracts`, que os dois lados já compartilham; a política mora
no `identity`. O CASL é isomórfico e sem dependências — é exatamente o tipo de
coisa que esse pacote existe para carregar.

Isso é para **esconder o que a pessoa não pode fazer**, e nada além: o
servidor decide o que acontece, o front decide o que desenhar.

## Consequências

Toda rota de recurso de alguém passa a custar a busca do recurso ANTES da
decisão de autorização — não dá para recusar pelo id sem carregar a linha, ou
a resposta denunciaria a existência pelo tempo. É um custo real e aceitável:
são leituras por chave primária.

O 404 no lugar do 403 atrapalha o diagnóstico de quem desenvolve: "não achei"
e "não é seu" ficam indistinguíveis também para nós. Fica indistinguível no
corpo da resposta; no log, o handler pode registrar qual dos dois foi.

Ganhamos uma superfície pequena e um só lugar para mudar: quando `library`
nascer, ele não escreve regra nenhuma — chama a fachada e o helper.

Perdemos a checagem de permissão em tempo de compilação para o campo das
condições: `{ userId }` é convenção, não tipo. Todo recurso com dono precisa
carregar `userId`, inclusive o perfil, cuja coluna correspondente em `users`
se chama `id` — a borda faz o mapeamento de uma linha.

Expor as regras ao front expõe também o formato delas. Uma condição mais rica
que igualdade simples (um `$in` com ids, por exemplo) vazaria dados pela
própria regra. Por isso o schema do contrato aceita hoje só string e booleano
nas condições: a restrição é deliberada, e ampliá-la é uma conversa, não um
detalhe de implementação.

## Alternativas descartadas

**Checagem ad-hoc (`if (recurso.userId !== request.userId)`) em cada rota.**
Funciona e é mais simples — até a terceira rota. Não dá para responder "o que
esta pessoa pode fazer?" ao front sem reimplementar tudo do outro lado, e é aí
que back e front começam a divergir.

**Modelar papéis granulares e permissões em tabela** (RBAC completo, com
`roles`, `permissions`, `role_permissions`). Descartado por ser resposta a um
problema que o produto não tem: hoje há um papel administrativo e um comum. A
migração de dois valores para uma tabela, no dia em que fizer falta, é barata;
o custo de manter permissões que ninguém usa não é.

**Responder 403 para recurso alheio.** É o que a maioria das APIs faz e é o
que denuncia a existência do recurso. Num produto em que a privacidade do
acervo é premissa (ADR 0006), a diferença entre 403 e 404 é literalmente a
diferença entre confirmar e não confirmar que aquele id existe.

**Reescrever as regras no front**, à mão, para esconder botão. Duas fontes de
verdade que divergem no primeiro ajuste. Serializar as regras que o servidor
já montou custa uma rota e mantém uma definição só.

**Mandar as regras dentro de `GET /api/auth/me`.** Descartado porque `/me`
exige sessão (401 sem ela) e o visitante também precisa saber o que pode — ler
o catálogo e jogar homebrew. Uma rota que responde nos dois estados evita o
front ter dois caminhos para a mesma pergunta.
