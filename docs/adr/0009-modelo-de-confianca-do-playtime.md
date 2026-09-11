# 0009. Creditar playtime por heartbeat, medido pelo relógio do servidor

Data: 2026-09-10
Status: aceita

## Contexto

`UserGame.totalPlaytimeSeconds`/`lastPlayedAt` existem no schema desde a M2 e
nenhum código de aplicação grava neles — é scaffold vazio esperando esta
issue (#119). O CLAUDE.md já registra o princípio, sem o mecanismo: "não
confiar em tempo declarado pelo cliente. Playtime, XP e score são creditados
pelo relógio do servidor."

A fundação já existe desde a M1: a aba oculta pausa a emulação
(`apps/web/src/features/player/use-emulator.ts`), com o comentário "é a
fundação do playtime honesto da M6, onde o servidor só credita tempo com aba
visível" escrito na hora. O sinal (`abaVisivel && status === 'running'`) já
está pronto para o front consumir; falta o mecanismo do lado do servidor que
o transforma em segundos creditados.

Três perguntas precisam de resposta antes de escrever uma linha de código:

**Como o servidor sabe que alguém estava mesmo jogando?** A resposta honesta é
que ele não sabe — nenhum design de heartbeat sobre HTTP prova isso. O que dá
para garantir é mais estreito: o servidor nunca aceita um relógio declarado
pelo cliente, e nunca credita mais do que o tempo que ele mesmo viu passar
entre duas chamadas legítimas de alguém autenticado como dono daquele save.
Contra o cliente ingênuo ou apressado (aba em segundo plano sem pausar,
relógio do sistema errado, um retry de rede duplicando uma requisição), isso
basta. Contra alguém disposto a escrever um script que chama a rota
autenticado com o próprio cookie válido, sem jogar nada — isso não impede,
e a seção "Consequências" nomeia esse limite em vez de fingir resolvê-lo.

**Heartbeat vs. sessão fechada no fim.** "Sessão fechada no fim" (abrir e
fechar uma sessão de jogo, creditando o intervalo todo quando ela termina)
tem um problema fatal: a aba fecha, o processo é matado pelo sistema, a
bateria do notebook acaba — nenhum desses eventos garante rodar o "fim" no
navegador (`beforeunload` não é confiável e não existe em toda circunstância
de fechamento). Perder o crédito de uma sessão inteira porque o navegador
fechou sem avisar é pior que o problema que o modelo tenta resolver.
Heartbeat periódico não tem esse modo de falha: cada pulso credita o próprio
intervalo, então o pior caso de "a aba morreu sem avisar" é perder o último
intervalo (no máximo o teto da decisão 1), nunca a sessão inteira.

**O que impede forjar/inflar tempo.** Três vetores, três respostas, nas
decisões abaixo: heartbeat isolado que chega tarde ou fora de ordem (decisão
1), abas/dispositivos múltiplos jogando "o mesmo" tempo (decisão 2), e ROM
que o catálogo não reconhece, sem `gameId` para creditar (decisão 3).

O módulo dono: `progress` já é dono do relógio do servidor para save na
nuvem — todo `updatedAt` de `UserSave` é carimbado pelo Prisma no momento da
escrita, nunca aceito do cliente (`gravar-sram.ts`, `gravar-save-state.ts`).
Creditar playtime é o mesmo padrão (relógio do servidor, nunca do cliente)
aplicado a uma tabela diferente do mesmo schema. O CLAUDE.md diz que
`achievements`/`leaderboards` só nascem na M6 — mas playtime em si não é
conquista nem ranking (essas são as issues #120 e #122, fora de escopo aqui,
como o texto da própria #119 declara); é o dado de que as duas vão precisar,
e `progress` é onde ele cabe sem abrir módulo novo.

## Decisão

### 1. Formato do heartbeat: sem corpo, sem timestamp do cliente

O front manda `POST /progress/heartbeat/:romId` a cada
`INTERVALO_DE_HEARTBEAT_SEGUNDOS = 20` segundos, **sem corpo** — nenhum campo
de tempo, nenhum timestamp declarado. Vinte segundos porque é granularidade
o bastante para uma sessão de alguns minutos não perder tempo relevante ao
teto abaixo, sem virar uma requisição a cada poucos segundos numa sessão de
horas (issues de ranking e conquistas vão ler `totalPlaytimeSeconds`, não o
heartbeat cru — não precisam de granularidade fina).

O servidor calcula o intervalo a partir do PRÓPRIO relógio: para cada
`(userId, gameId)`, guarda em `UserGame.lastPlayedAt` o instante do último
heartbeat aceito. A cada heartbeat novo, credita
`min(agora_do_servidor - lastPlayedAt, TETO)` segundos, onde
`TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS = 30` (`20 * 1.5`) — meia folga acima
do intervalo normal, o bastante para absorver variação de rede sem abrir
espaço para inflar por atraso deliberado. Um heartbeat que chega depois de um
hiato de uma hora (aba oculta e voltou, notebook suspenso) credita só os 30
segundos do teto, nunca a hora inteira. `lastPlayedAt` sempre avança para o
"agora" do servidor no fim, então o próximo heartbeat mede a partir daí — o
hiato em si nunca é recuperado, só nunca mais é contado duas vezes.

Não existe timestamp de cliente na requisição porque não existe pergunta que
ele responderia com segurança: "desde quando você está jogando" é
exatamente o dado que o cliente não pode provar, e um heartbeat sem corpo
elimina o vetor em vez de tentar validar um valor que nunca deveria ter
existido. Isso também resolve, de graça, a parte de "replay/fora de ordem"
do critério de aceite: um heartbeat repetido, atrasado, ou entregue fora da
ordem em que foi enviado não carrega tempo declarado nenhum para forjar — ele
só dispara o cálculo acima, no instante em que o SERVIDOR o processa, e o
teto garante que o pior caso é sempre pequeno.

`calcularCreditoDoHeartbeat` (`apps/api/src/modules/progress/domain/heartbeat.ts`)
é a função pura com essa conta — `Math.max(0, ...)` cobre o caso defensivo de
um `agora` anterior ao `lastPlayedAt` (relógio do servidor ajustado para trás
por NTP; não deveria acontecer, e se acontecer credita zero, nunca playtime
negativo).

O primeiro heartbeat de uma conta para um jogo (`lastPlayedAt` ainda `null`)
credita zero: não há marco anterior para medir intervalo. Ele só estabelece
o marco, e o SEGUNDO heartbeat em diante é que credita.

### 2. Abas múltiplas: o lock de linha do Postgres, não um contador novo

Duas abas (ou dois dispositivos) da mesma conta, jogando o mesmo jogo ao
mesmo tempo, não podem dobrar o playtime. A ADR 0019 já recusou Redis como
peça nova de infraestrutura para um problema que o Postgres, que já é
obrigatório, resolve — o mesmo raciocínio se aplica aqui: sem serviço novo,
sem dependência nova, sem variável de ambiente nova.

A solução mora inteira em como `PrismaUserGameRepository.creditarHeartbeat`
está escrito: cada heartbeat abre uma transação, faz um `upsert` na linha de
`UserGame` (criando-a se for a primeira vez, ou tocando-a com um `UPDATE` de
verdade — `totalPlaytimeSeconds: { increment: 0 }`, escolhido justamente
para forçar um `UPDATE` real e não um `DO NOTHING`), lê o `lastPlayedAt`
atual, calcula o crédito e grava o novo total e o novo `lastPlayedAt` — tudo
dentro da mesma transação. O `UPDATE` do `upsert` toma o lock de linha do
Postgres e o mantém até o fim da transação: a transação de uma segunda aba
que chega ao mesmo tempo BLOQUEIA no próprio `upsert` até a primeira
terminar, e só então lê o `lastPlayedAt` que a primeira já avançou.

O efeito prático: duas abas mandando heartbeat "ao mesmo tempo" nunca leem o
mesmo `lastPlayedAt` de partida — a segunda a chegar sempre parte do relógio
que a primeira já avançou. O total creditado ao longo do tempo por qualquer
número de abas concorrentes converge para o tempo de relógio real decorrido,
nunca para um múltiplo dele, sem precisar identificar dispositivo, sem
token de sessão de jogo, sem nenhuma peça nova — o `(userId, gameId)` já é a
chave natural que o schema já tem (`@@id([userId, gameId])`), e o lock de
linha sobre essa chave é o mecanismo inteiro.

### 3. ROM não reconhecida: heartbeat não credita nada, sem erro

`UserGame` é sobre o jogo do CATÁLOGO (`gameId`), não sobre a ROM enviada
(`UserRom`). Pelo BYOR (ADR 0006), a maioria das ROMs de uma biblioteca não
tem `gameId` — só quando o hash bate com algo que o catálogo conhece. Não
existe onde creditar playtime de uma ROM sem `gameId`: não há linha de
`UserGame` possível sem ele, e inventar uma entidade nova para playtime "por
ROM, sem jogo" duplicaria o que o catálogo já é para o resto do produto
(conquistas e ranking, #120/#122, são por jogo, não por arquivo).

A rota resolve `gameId` a partir do `romId` recebido — nunca de um valor que
o cliente declare no corpo. Se `rom.gameId` for `null`, a resposta é
`{ status: 'sem-jogo-reconhecido' }`, com `200`: não é erro, é o estado
normal de boa parte das ROMs do BYOR, o mesmo raciocínio que já rege
`sramDownloadSemSaveSchema` para "ROM sem save ainda". O front, por sua vez
(ver `apps/web/src/features/player/heartbeat-de-playtime.ts`), só dispara o
heartbeat quando já sabe, pela própria listagem da biblioteca, que a ROM tem
`gameId` — evitando a viagem de rede morta na maioria dos casos, mas o
servidor protege sozinho mesmo que o front não filtrasse.

**Consequência aceita**: playtime de ROM não reconhecida simplesmente não é
contado hoje. Quem quiser que uma ROM comece a contar precisa que o catálogo
passe a reconhecer o hash dela — o mesmo gatilho que já faz a capa e o
título aparecerem na estante.

## Consequências

Toda vez que o jogo está rodando com a aba visível, o front bate uma
requisição a cada 20 segundos. Para uma sessão de uma hora, isso são 180
requisições HTTP — pequenas (sem corpo), na mesma rota autenticada que a
SRAM já usa a cada gravação, e um volume que o produto já tolera hoje sem
Redis nem CDN dedicado. Se algum dia o volume justificar, dá para aumentar o
intervalo sem tocar no resto do desenho — `INTERVALO_DE_HEARTBEAT_SEGUNDOS`
e `TETO_DE_CREDITO_POR_HEARTBEAT_SEGUNDOS` são as duas únicas constantes que
mudariam.

O que este design **não resolve**, e não tenta resolver: alguém com sessão
autenticada válida que escreva um script batendo `POST
/progress/heartbeat/:romId` a cada 20 segundos, 24 horas por dia, sem nunca
abrir o jogo, credita playtime real — o servidor não tem como distinguir
esse script do front legítimo, porque os dois mandam exatamente a mesma
requisição vazia. Isto não é um buraco que passou batido: é o limite de
qualquer heartbeat sobre REST que não amarra o pulso a uma prova mais forte
de que o jogo está de fato rodando (um token de sessão de jogo emitido e
validado em tempo real contra o próprio processo de emulação, por exemplo).
Esse mecanismo mais forte não existe hoje e não é assunto desta issue — o
que o design daqui garante é que o TETO por heartbeat impede a explosão de
crédito (nunca mais que tempo real decorrido, nunca dobrado por abas
múltiplas), não que ele seja à prova de um atacante disposto a gastar tempo
real de verdade rodando um script. Se isso vier a importar — o gatilho
natural é o ranking por playtime, #122 — a defesa certa é a #122 decidir,
não esta ADR forçar antecipadamente uma peça que ninguém pediu ainda.

A tabela `user_games` ganha uma escrita por heartbeat aceito, em vez de
nenhuma escrita como hoje. Para o volume do produto isso é uma linha
atualizada, não criada, na maioria das vezes (`@@id([userId, gameId])` já
existe desde a M2) — sem crescimento sem limite, ao contrário de
`auth_attempts` (ADR 0019), que cresce por tentativa.

## Alternativas descartadas

**Confiar num timestamp que o cliente declara** ("joguei de HH:MM até
HH:MM"), com o servidor só validando que o intervalo é plausível. Descartado
porque "plausível" ainda é um teto arbitrário sobre um valor forjável —
mistura duas fontes de verdade (o relógio do cliente e o teto do servidor)
quando uma só (o relógio do servidor, sem teto de validação porque não há
nada para validar) resolve com menos código e menos superfície de ataque.

**Sessão de jogo com início e fim** (`POST /progress/sessions` no começo,
`PATCH .../end` no fim, servidor credita o intervalo entre os dois). Mais
"correto" na aparência, mas com um modo de falha sério: o fim depende de um
evento do navegador que não é garantido de disparar (fechar a aba, matar o
processo, notebook sem bateria) — perder o evento de fim perde a sessão
inteira, não só o último pulso. Heartbeat periódico degrada bem: perde, no
pior caso, o último intervalo, capado pelo mesmo teto que já existe.

**Redis para o lock/contador de abas múltiplas.** A ADR 0019 já respondeu a
mesma pergunta para outro contador: seria serviço novo, dependência nova,
variável de ambiente nova, para um problema que o Postgres — peça que já é
obrigatória — resolve com um `UPDATE` e o lock de linha que ele já toma de
graça.

**Um token de sessão de jogo, emitido no início da partida e exigido em cada
heartbeat**, como defesa contra o script mencionado nas Consequências.
Resolveria aquele vetor específico, mas troca "confiar no cookie de sessão
autenticada" por "confiar em mais um token emitido pelo mesmo servidor que
já emite o cookie" — não fecha o vetor, só adiciona uma camada que outro
script, com o mesmo esforço, também reproduziria (pedir o token antes de
simular o heartbeat). Vale a pena discutir de novo se o ranking por playtime
(#122) tornar esse abuso lucrativo o bastante para valer o custo; hoje não
há ranking nenhum lendo este número.

**Guardar o playtime por `UserRom` em vez de por `UserGame`.** Resolveria a
ROM não reconhecida (toda ROM tem uma linha de `UserRom`, reconhecida ou
não), mas moveria o problema para dentro de conquistas e ranking (#120,
#122): as duas leem playtime "do jogo", e uma ROM comercial e a homebrew
equivalente do mesmo jogo, ou duas cópias regionais diferentes (duas linhas
de `UserRom`, um `gameId` só), fragmentariam o total em vez de somar. Manter
o crédito em `UserGame` — e aceitar que ROM sem `gameId` simplesmente não
credita — mantém uma fonte de verdade por jogo, que é a granularidade que
todo o resto do produto (conquistas, ranking, a ficha do jogo na estante) já
usa.

**Criar `achievements`/`leaderboards` agora, antecipando a M6**, para não
"contaminar" `progress` com um dado que vai alimentar as duas. Descartado
pelo mesmo motivo que o CLAUDE.md já registra: essas pastas nascem quando a
M6 começar de verdade, com as perguntas próprias dela (que evento credita
conquista, como o ranking pagina). `progress` já é dono do relógio do
servidor para o resto do módulo; adicionar mais uma tabela que ele escreve
com a mesma disciplina não é a mesma coisa que abrir um domínio novo.
