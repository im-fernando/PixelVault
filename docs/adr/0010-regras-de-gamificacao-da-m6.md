# 0010. Regras de gamificação da M6: as conquistas de plataforma

Data: 2026-09-10
Status: aceita

## Contexto

O [ADR 0008](0008-viabilidade-de-conquistas-por-evento-de-jogo.md) fechou o
"plano B" como piso garantido da M6: conquistas de plataforma, nenhuma delas
lendo memória de console, todas saindo de dado que o servidor já tem (ou vai
ter, pela issue #119) por outro motivo:

> horas jogadas, jogos distintos jogados, tamanho da coleção, streaks de
> dias, primeiro save state, primeira ROM enviada, primeira sincronização

O que faltava era a lista fechada — quais conquistas existem, os limites de
cada uma, e onde no código cada uma se conecta. É isso que esta ADR decide,
como parte da issue #120.

`achievements` nasce como módulo nesta issue (CLAUDE.md: "nascem na M6 — não
crie a pasta antes"), seguindo a convenção de `progress`
(domain/application/infrastructure/http/index.ts).

## Decisão

### As conquistas por evento — desbloqueiam no momento em que o gesto acontece

| Código                   | Desbloqueia quando…                     | Módulo dono do evento |
| ------------------------ | --------------------------------------- | --------------------- |
| `primeira_rom_enviada`   | a conta confirma o envio de uma ROM     | `library`             |
| `primeiro_save_state`    | a conta grava um save state com sucesso | `progress`            |
| `primeira_sincronizacao` | a conta grava SRAM na nuvem com sucesso | `progress`            |

`primeiro_save_state` e `primeira_sincronizacao` são conquistas diferentes,
mesmo as duas sendo "gravar save na nuvem", porque são gestos de produto
diferentes: SRAM sincroniza sozinha, em segundo plano, o tempo todo que a
pessoa está jogando (ver o cabeçalho de `progress/application/gravar-sram.ts`);
save state nasce de um clique explícito num slot da galeria. A primeira é o
primeiro gesto invisível da conta; a segunda é o primeiro gesto deliberado.

Idempotência: cada conquista de evento vive numa linha de
`user_achievements`, sob `@@unique([userId, code])`. Quem dispara o evento
não pergunta "já tinha?" antes de avisar — avisa sempre, e é a constraint
única quem decide se aquilo é novidade. Perguntar antes seria abrir uma
corrida entre a checagem e a gravação; a constraint não tem essa corrida.

### As conquistas por agregação — verificadas contra o estado real da conta

Três tiers por família (bronze/prata/ouro), e a mesma forma para as três:
um limiar mínimo, checado sob demanda quando a conta lista as próprias
conquistas (não a cada escrita — ver "Cálculo: sob demanda" abaixo).

**Tamanho da coleção** — quantas ROMs a conta tem (`UserRomRepository.contar`,
em `library`):

| Código                | Mínimo   |
| --------------------- | -------- |
| `colecionista_bronze` | 10 ROMs  |
| `colecionista_prata`  | 50 ROMs  |
| `colecionista_ouro`   | 100 ROMs |

Os números ficam bem abaixo de `COTA_DE_ROMS_POR_CONTA` (1500): a conquista
celebra o hábito de colecionar, não o teto da conta. Quem chega a 1500 ROMs
já tem as três conquistas há muito tempo — elas não são o desafio final.

**Jogos distintos jogados** — quantas linhas de `user_games` a conta tem
(`UserGameRepository.agregarParaUsuario`, em `progress`; uma linha por jogo já
jogado, `@@id([userId, gameId])`):

| Código              | Mínimo   |
| ------------------- | -------- |
| `explorador_bronze` | 5 jogos  |
| `explorador_prata`  | 20 jogos |
| `explorador_ouro`   | 50 jogos |

Números bem menores que os de coleção, de propósito: ter a ROM na biblioteca
não é ter jogado. Esta família mede variedade de uso, não tamanho de acervo —
e por isso os limiares são baixos: jogar 50 jogos diferentes é um uso real e
generoso da biblioteca, não um número que qualquer coleção grande atinge de
graça.

**Horas jogadas** — soma de `UserGame.totalPlaytimeSeconds` da conta
(mesmo repositório de jogos distintos):

| Código             | Mínimo   |
| ------------------ | -------- |
| `dedicacao_bronze` | 1 hora   |
| `dedicacao_prata`  | 10 horas |
| `dedicacao_ouro`   | 50 horas |

**Ponto de ligação pendente com a #119.** `totalPlaytimeSeconds` existe no
schema desde a M4, mas nenhum código escreve nele de verdade — quem faz isso
é a #119 (playtime honesto pelo relógio do servidor), que pode estar em
paralelo com esta issue ou não ter mergeado ainda quando esta terminar. Até
lá, `agregadoDeJogoDoUsuario` (em `progress`) sempre devolve
`segundosJogados: 0`, e nenhuma das três conquistas de dedicação desbloqueia
para ninguém — o que é esperado, não bug: a conta não tem hora nenhuma que o
servidor tenha certificado. O dia em que a #119 passar a escrever valores
reais, a família liga sozinha, sem mudar uma linha desta ADR nem do módulo
`achievements` — o `UserGameRepository` já lê a coluna certa hoje.

### Streak de dias — decidida, não implementada

O ADR 0008 lista "streaks de dias" entre as candidatas do plano B, e esta ADR
fixa a forma pretendida para o dia em que ela puder ser construída:

| Código              | Mínimo  |
| ------------------- | ------- |
| `constancia_bronze` | 3 dias  |
| `constancia_prata`  | 7 dias  |
| `constancia_ouro`   | 30 dias |

Sem uma implementação nesta issue, e a diferença para "horas jogadas" importa:
lá existe uma coluna (`totalPlaytimeSeconds`) esperando por quem escreve nela.
Streak de dias não tem equivalente — nenhuma tabela hoje registra "esta conta
jogou no dia X", e `UserGame.lastPlayedAt` guarda só o ÚLTIMO dia, não o
histórico que um streak precisa para saber se ontem também teve jogo. Fingir
uma implementação sobre um dado que não existe seria pior do que não ter a
conquista: um streak sempre zerado passaria por "não implementei o cálculo",
quando na verdade a fonte nem existe. Esta família fica de fora do código
desta issue, para nascer junto com o que primeiro precisar de "dia distinto
jogado" — o candidato mais provável é a própria #119, se o modelo de sessão
de jogo que ela desenhar já granular por dia.

### Cálculo: sob demanda, não recalculado a cada escrita

As três famílias de agregação são verificadas dentro da própria chamada de
`GET /api/achievements` (`atualizarConquistasPorAgregacao`, antes de listar),
não em gatilho espalhado por `library`/`progress` a cada upload, favorito ou
gravação de save.

Motivo: as três consultas (`COUNT` de ROMs, `COUNT`+`SUM` de `user_games`) já
são baratas — sobre índice, do mesmo jeito que `medirUso` já faz nos dois
módulos para a cota — e o produto não tem hoje nenhum lugar que renderize
conquista de uma conta com frequência alta o bastante para o custo de três
consultas por listagem pesar. Manter um gatilho em cada ponto de escrita
custaria mais código e mais acoplamento (cada rota de `library`/`progress`
precisaria saber que existe uma agregação para verificar) por um ganho que
ninguém vai notar: a conta olha a própria lista de conquistas de vez em
quando, não a cada upload.

Se um dia isso pesar — um perfil público (outra issue) que renderiza
conquista de terceiros com frequência —, a resposta é cachear o resultado ou
mover o cálculo para o gatilho de escrita, e a mudança fica inteira dentro de
`achievements`: nem o schema, nem o repositório de conquistas, nem a listagem
final precisam saber que a estratégia trocou.

### Schema

Uma tabela, `user_achievements`, com `userId`, `code` (enum
`AchievementCode`) e `unlockedAt` (`@default(now())`, carimbo do servidor).
`@@unique([userId, code])` é a idempotência inteira do critério de aceite —
ver "As conquistas por evento" acima.

### Comunicação entre módulos, sem cruzar fronteira

Duas direções, dois mecanismos, porque as duas ao mesmo tempo pela mesma
via fechariam um ciclo real (não só uma regra de lint: `achievements`
precisando de `library`/`progress` para agregação, e `library`/`progress`
precisando de `achievements` para evento, ao mesmo tempo):

- **Evento** (`library`/`progress` → `achievements`): import direto da
  fachada, o mesmo padrão de `library` perguntando `identificarRomPorHash` a
  `catalog`. `library` e `progress` declaram, cada um no próprio domínio, o
  tipo da porta que consomem (`AvisarPrimeiraRomEnviada`, etc.);
  `achievements/index.ts` exporta funções já prontas
  (`avisarPrimeiraRomEnviada`, `avisarPrimeiroSaveState`,
  `avisarPrimeiraSincronizacao`) que os `http/routes.ts` dos dois módulos
  importam e passam como aquela porta — compatibilidade estrutural, sem
  nenhum dos dois lados importar tipo do outro.
- **Agregação** (`achievements` → `library`/`progress`): injeção pela
  composition root (`app.ts`), que já importa os três módulos. `library`
  exporta `contarRomsNaBiblioteca`; `progress` exporta
  `agregadoDeJogoDoUsuario`; `app.ts` passa as duas para `achievementsRoutes`
  por `opcoes`, a mesma mecânica que já injeta `armazenamento` em
  `library`/`progress`.

### Rota

`GET /api/achievements` — as conquistas que a própria conta desbloqueou.
Autorização por `Achievement` (novo assunto do CASL, ADR 0018), condicionado
a `userId`: a conta só lê a própria lista. Uma issue futura de perfil público
consome isto (ou uma rota irmã) para mostrar conquista de outra conta.

## Consequências

**Fica mais fácil**

- Nenhuma conquista desta lista depende de ler memória de console: cai a
  M6 inteira, mesmo se a #119 atrasar (só "horas jogadas" fica sem
  desbloquear) ou se o canal do ADR 0008 sumir numa atualização de core.
- O padrão de porta declarada por quem consome, já usado por
  `IdentificarRomNoCatalogo`, se repete três vezes sem inventar mecanismo
  novo — `achievements` não introduziu um jeito diferente de cruzar
  fronteira, só reaproveitou o que já existia.

**Fica mais difícil**

- A regra de "sob demanda" significa que uma conquista de agregação nunca
  aparece sozinha numa notificação em tempo real — só quando a conta abre a
  própria lista. Se o produto quiser um toast de "você desbloqueou X" no
  instante exato em que a conta cruza o limiar de coleção, esta decisão
  precisa ser revista primeiro.
- Streak de dias fica sem implementação até existir uma fonte de "dia
  distinto jogado" — quem for fechar essa lacuna precisa decidir se cabe em
  `progress` (dono do playtime) ou merece tabela própria.
- Duas mecânicas diferentes para "falar com outro módulo" no mesmo módulo
  (`achievements` recebe por import direto E por injeção da composition
  root) é mais para explicar a quem lê o código por trás do que uma escolha
  só — o preço de evitar um ciclo real, não só de lint.

## Alternativas descartadas

**Compor um único evento genérico `avisarEventoDeGamificacao(userId, tipo)`
em vez de uma função por evento.** Pareceria mais "escalável", mas
`library`/`progress` teriam que conhecer o vocabulário de código de
`achievements` (o enum inteiro, ou pelo menos os três valores de evento) para
escolher `tipo` — exatamente o acoplamento que a porta declarada por quem
consome existe para evitar. Uma função por evento mantém `library` sem saber
que `achievements` tem doze códigos; ela só sabe que existe algo para avisar.

**Import direto nos dois sentidos entre `achievements` e `library`/`progress`,
aceitando o ciclo.** O `dependency-cruiser` (docs/adr/0003, regra
`sem-ciclos`) reprova build com dependência circular, e com razão: não é
peculiaridade da ferramenta, é o próprio desenho quebrando — dois módulos
que precisam um do outro para funcionar não têm fronteira real entre eles.

**Recalcular agregação em cada escrita de `library`/`progress`, gravando o
resultado imediatamente.** Descartado por agora pelo raciocínio da seção
"Cálculo: sob demanda" — o custo de manter gatilhos em cada rota de escrita
não se paga contra o ganho de uma conquista aparecer um pouco mais rápido
numa lista que a conta abre raramente.

**Guardar "conquista bloqueada" na resposta de `GET /api/achievements`, com
progresso parcial (`7 de 10 ROMs`).** Ficaria mais rico para o front, mas
exigiria decidir onde vive a lista completa de conquistas possíveis (banco?
estática no front?) e o texto de cada uma — decisão de produto/conteúdo que
esta issue não tinha para tomar. A resposta de hoje é só o que já desbloqueou;
uma issue de front pode mapear os códigos ausentes contra uma lista estática
própria, sem que o servidor precise saber de texto ou progresso parcial.
