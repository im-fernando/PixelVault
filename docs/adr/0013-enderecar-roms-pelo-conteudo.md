# 0013. Endereçar ROMs pelo conteúdo, com contagem de referências

Data: 2026-09-07
Status: aceita

## Contexto

No modelo BYOR ([0006](0006-byor-mais-catalogo-de-metadados.md)), cada pessoa
envia as próprias ROMs. Bibliotecas de ROM se sobrepõem enormemente: quem joga
SNES tem, em larga medida, os mesmos vinte jogos que todo mundo.

O schema já trata o SHA-256 como identidade canônica da ROM — é por ele que
`game_roms` casa o arquivo enviado com o catálogo de metadados, e
`user_roms` tem `@@unique([userId, sha256])`.

Falta decidir como nomear o objeto no storage. Duas saídas:

- `users/<userId>/<sha256>` — um objeto por usuário
- `roms/<sha256>` — um objeto por conteúdo, compartilhado

## Decisão

Endereçamento por conteúdo: **`roms/<sha256>`**, com contagem de referências
para saber quando o objeto pode ser apagado.

`user_roms` continua sendo a única fonte de verdade sobre **quem** tem direito
a **qual** conteúdo. O objeto no storage não carrega dono.

Regras que acompanham a decisão:

1. **O bucket é privado.** Nunca há URL pública. Todo acesso é por presigned GET
   de TTL curto.
2. **A autorização vem do banco, nunca da URL.** A API só assina depois de
   confirmar que existe linha em `user_roms` ligando aquele usuário àquele
   `sha256`. Conhecer o hash não dá direito a nada.
3. **Apagar é remover a referência.** O objeto só é coletado quando nenhuma
   linha o referencia mais.
4. **O arquivo é guardado como o usuário enviou.** Nada de normalizar. Dump de
   SNES costuma vir com 512 bytes de cabeçalho de copiador, e o hash sem
   cabeçalho serve apenas para casar com o catálogo — remover o cabeçalho seria
   alterar o arquivo que é dele.

## Consequências

Quinhentas pessoas com o mesmo jogo passam a ocupar um objeto, e não
quinhentos. Como o custo de armazenamento é por gigabyte, a economia é direta e
cresce com a base.

O upload de um jogo que já existe no storage vira instantâneo: o servidor
reconhece o hash, cria só a referência e não transfere nada. Isso é bom de
produto, não só de custo.

Em troca, herdamos três obrigações que o modelo por usuário não teria:

- **Contagem de referências de verdade.** Apagar objeto que ainda tem dono é
  perder o arquivo de outra pessoa. É o tipo de bug que só aparece em produção,
  com dado real.
- **A verificação de conteúdo passa a ser obrigatória**, e não recomendada. Um
  objeto compartilhado gravado sem conferência envenena todos os que o
  referenciam — ver [0014](0014-verificar-a-rom-em-quarentena-antes-de-promover.md).
  As duas decisões são inseparáveis: adotar esta sem aquela seria irresponsável.
- **O hash vira dado sensível de autorização.** Se algum dia a API assinar URL
  a partir de hash informado pelo cliente, sem checar a referência, vira
  download universal de qualquer ROM que alguém já tenha subido.

## Alternativas descartadas

**`users/<userId>/<sha256>`.** Mais simples, isolado por construção, e imune ao
envenenamento — cada um estraga só o próprio arquivo. Foi descartado pelo
desperdício: guardaria o mesmo jogo dezenas de vezes num produto em que a
sobreposição entre bibliotecas é a regra, não a exceção.

Continua sendo o caminho certo se a contagem de referências ou a verificação se
mostrarem frágeis demais para manter.
