# Curadoria de metadados de jogos comerciais

A issue #114 descobriu, testando a biblioteca pessoal,
que o catálogo (`packages/database/prisma/seed.ts`) só tem quatro homebrew de
exemplo. Sem hash comercial nenhum em `game_roms`, `identificarRomPorHash`
(`apps/api/src/modules/catalog/application/identificar-rom.ts`) nunca casa
para o caso mais comum do BYOR — alguém subindo um jogo de verdade — e a capa
nunca aparece sozinha.

Este documento registra **o processo** para alguém cadastrar metadado de jogo
comercial no futuro. Não é uma importação de base de dados: decidir a fonte
definitiva (No-Intro/Redump para hash, algo como IGDB/TheGamesDB para título,
ano e publisher) é trabalho de dados, não de código, e está deliberadamente
fora do escopo de quem escreveu isto. Ver [ADR 0006](adr/0006-byor-mais-catalogo-de-metadados.md)
para o porquê de o catálogo ser só metadado.

## O que entra, e em que tabela

Duas tabelas do `schema.prisma`, as mesmas que o homebrew já usa:

- **`games`**: `title`, `slug`, `systemId`, `releaseYear`, `publisher`,
  `coverUrl`. `isHomebrew: false`, sempre, para jogo comercial.
- **`game_roms`**: `gameId`, `sha256`, `region`, `revision`. **`storageKey` e
  `sizeBytes` ficam `null`** — são os campos que existem só para o caso de
  homebrew, cujo arquivo o PixelVault pode servir. Preenchê-los para um jogo
  comercial seria hospedar a ROM, que a ADR 0006 proíbe sem exceção.

`coverUrl` de jogo comercial normalmente **não precisa ser preenchido à mão**:
é isso que `garantirCapaDoJogo` (issue #77) já faz sozinho, na primeira vez que
alguém sobe uma ROM cujo hash acabou de ser cadastrado — ou no reprocessamento
retroativo (`POST /api/admin/library/roms/recognize`, issue #114) para quem já
tinha subido antes.

## O cuidado com hash

`sha256` em `game_roms` precisa ser o hash **sem o cabeçalho de copiador**
(ver o comentário de `GameRepository.identificarRomPorHash` em
`apps/api/src/modules/catalog/domain/game-repository.ts`) — é assim que as
bases de metadado (No-Intro, Redump) catalogam, e é por isso que o upload
tenta os dois hashes contra o catálogo. Cadastrar o hash com cabeçalho faria a
maioria dos dumps reais (que têm o cabeçalho) nunca casar.

**Nunca invente um hash.** Um SHA-256 errado não é um erro visível — ele
simplesmente nunca casa, silenciosamente, e alguém só descobre auditando o
banco. Se não houver como confirmar o valor contra uma fonte pública e
citável, a entrada não entra. É a mesma disciplina que `docs/homebrew.md` já
aplica à licença: dado incerto fica de fora, e o motivo do descarte fica
registrado.

## O que NUNCA fazer

- **Nunca preencher `storageKey` de `game_roms` para jogo comercial.** É o
  único campo que decide se o PixelVault serve o arquivo, e servir ROM
  comercial é a linha que a ADR 0006 existe para não cruzar.
- **Nunca baixar nem hospedar o arquivo da ROM em lugar nenhum do
  repositório** — nem para "só calcular o hash". O hash de um dump
  amplamente documentado (No-Intro, Redump) é um número publicado por
  terceiros; ele se cita, não se recalcula baixando o jogo.
- **Nunca cadastrar capa (`coverUrl`) copiando arte para dentro do
  repositório.** O caminho de homebrew (`/roms/<slug>/capa.png`) serve porque
  a arte é do próprio autor, redistribuída com permissão documentada em
  `docs/homebrew.md`. Capa de jogo comercial vem de fora (`garantirCapaDoJogo`
  aponta para `libretro-thumbnails`) exatamente para não precisar vendorizar
  imagem sem licença.

## Como cadastrar, hoje

Manual, em `packages/database/prisma/seed.ts`, numa lista **separada** de
`HOMEBREWS` — algo como `JOGOS_COMERCIAIS_RECONHECIDOS`, rotulada no comentário
como "só metadado, sem arquivo, hash verificado contra fonte pública" — e
upsert por `slug`, do mesmo jeito que o seed já faz. Cada entrada deveria
citar, num comentário, de onde veio o hash (ex.: "SHA-256 do dump No-Intro
`Title (Region).sfc`, conferido em <fonte>").

Não existe hoje rota administrativa de cadastro nem importação em lote — só o
seed. Se o catálogo crescer a ponto de o seed manual não sustentar (dezenas de
títulos, atualização frequente), a próxima etapa natural é uma rota HTTP
`admin` de escrita em `games`/`game_roms` (a mesma habilidade `manage` sobre
`Game` que já existe, docs/adr/0018) ou uma importação de arquivo CSV/JSON
verificado — mas isso é decisão para quando a dor aparecer, não antecipação.

## Por que esta sessão não adicionou nenhum jogo comercial ao seed

A issue pedia, como parte opcional do escopo, um punhado de 5 a 10 títulos de
SNES muito conhecidos com hash SHA-256 de dump No-Intro. Esta sessão não tem
acesso à internet para confirmar esses hashes contra uma fonte pública, e não
há memória confiável de SHA-256 de 64 caracteres hexadecimais — são números
grandes, não fatos memorizáveis com segurança. Registrar um hash errado seria
pior que não registrar nenhum: ele pareceria curadoria real e nunca casaria
com um dump verdadeiro, e o próximo a olhar o seed confiaria nele sem
suspeitar. Por isso esta parte do escopo foi deliberadamente pulada — a issue
já previa esse desfecho ("se não conseguir hashes confiáveis (...), pule esta
parte e documente por que pulou — não invente hash").

Quem pegar esta tarefa com acesso confiável a No-Intro ou Redump pode seguir a
seção "Como cadastrar, hoje" acima diretamente.
