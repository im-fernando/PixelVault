# 0006. Adotar BYOR com catálogo de metadados

Data: 2026-09-07
Status: aceita

## Contexto

O PixelVault vai ficar online e público. Um catálogo central de ROMs
comerciais hospedadas por nós é o que derruba o projeto do ar — não é
preciosismo jurídico, é o desfecho previsível.

Ao mesmo tempo, o produto que queremos construir — leaderboard, conquistas,
perfil, "em alta na semana" — precisa de uma entidade canônica de jogo. Sem ela
não há em torno de que ranquear: dois usuários com o mesmo jogo em arquivos
diferentes precisam aparecer no mesmo ranking.

## Decisão

**BYOR — Bring Your Own ROM.** Cada pessoa envia as próprias ROMs; elas são
privadas dela e nunca servidas a terceiros.

**O catálogo é de metadados**, não de arquivos. `games` guarda título, capa,
ano, gênero e console — tudo redistribuível. `game_roms` guarda os SHA-256
conhecidos por jogo, e é isso que permite reconhecer a ROM enviada e preencher
a capa sozinho. `storage_key` em `game_roms` só é preenchido para homebrew, que
podemos distribuir.

`user_roms` liga usuário a arquivo, com `game_id` nulo enquanto o hash não
casar com nada — a biblioteca funciona mesmo sem reconhecer o jogo.

Um **catálogo público de homebrew** convive junto, jogável sem login e sem
upload, para que a home tenha conteúdo no primeiro dia.

## Consequências

O site pode ser público. O nome vira literal: um cofre pessoal, não uma loja.

Toda a camada social pendura em `game_id`, e não em arquivo — que é o que
torna leaderboard e conquista possíveis entre usuários diferentes.

O reconhecimento por hash dá um momento bom de produto: a pessoa arrasta um
arquivo e a capa aparece.

O preço é atrito de entrada: sem ROM, sem biblioteca. O homebrew existe para
amortecer isso, mas não elimina.

Consequência técnica: dedupe por SHA-256 e quota por usuário deixam de ser
opcionais, porque upload é vetor de abuso.

## Alternativas descartadas

**Catálogo público com jogos hospedados.** Mais simples de construir e melhor
de usar, mas exige site privado ou por convite — o que mata o social, que é
metade do produto.

**Só homebrew.** Legalmente tranquilo e sem atrito, mas o acervo de homebrew de
SNES não sustenta uma biblioteca que a pessoa queira voltar a abrir.
