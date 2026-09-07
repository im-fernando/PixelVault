# 0014. Verificar a ROM em quarentena antes de promover o objeto

Data: 2026-09-07
Status: aceita

## Contexto

Duas decisões já tomadas, isoladamente sensatas, se combinam num problema.

A primeira: **a ROM não passa pela API**. O navegador envia direto para o
storage por presigned PUT, e a API apenas assina. É o que permite a um Fastify
modesto lidar com arquivos grandes — a alternativa seria a API intermediar
centenas de megabytes por upload.

A segunda: **o objeto é endereçado pelo conteúdo**
([0013](0013-enderecar-roms-pelo-conteudo.md)). O caminho é `roms/<sha256>`, e
o objeto é compartilhado por todos que tiverem aquele conteúdo.

Juntas, elas abrem um vetor de envenenamento. Quem assina a URL é a API, mas
quem escreve é o cliente — e o caminho depende de um hash que **o cliente
informou**. Um usuário mal-intencionado pede uma URL declarando o SHA-256 do
Super Mario World, envia outro arquivo qualquer, e a partir daí **todo mundo
que "tem" Super Mario World baixa o arquivo dele**.

O upload direto é justamente o que impede a API de ver o conteúdo e perceber.

O ataque não exige nada sofisticado: basta ser um usuário legítimo e mentir uma
vez.

## Decisão

Nenhum byte enviado pelo cliente vira objeto canônico sem o servidor ter
conferido o hash.

O fluxo de upload passa a ser:

1. A API assina um PUT para **`quarentena/<userId>/<uuid>`** — caminho que o
   cliente não escolhe e que não é compartilhado com ninguém.
2. O cliente envia o arquivo.
3. O cliente avisa a API que terminou.
4. **A API lê o objeto da quarentena e calcula o SHA-256 de verdade**, junto com
   as demais validações (tamanho, cabeçalho da ROM, sistema).
5. Se já existir `roms/<sha256>`, o objeto da quarentena é descartado e só se
   cria a referência em `user_roms`. Se não existir, ele é promovido.
6. Falhou a verificação, a quarentena é apagada e nada é promovido.

O hash informado pelo cliente é, no máximo, uma dica para responder cedo "já
tenho esse, nem envie". **Nunca** é o que determina o caminho final.

## Consequências

O custo é uma leitura por upload. No R2 isso é barato justamente porque não há
egress ([0012](0012-usar-cloudflare-r2-como-object-storage.md)) — as duas
decisões se sustentam mutuamente.

O upload deixa de ser instantâneo do ponto de vista do usuário: existe um passo
de verificação entre "enviei" e "está na minha biblioteca". A interface precisa
mostrar isso como estado, não fingir que acabou.

A quarentena precisa de expiração automática. Upload abandonado no meio é o
caso normal, não a exceção, e sem limpeza o bucket acumula lixo que ninguém
referencia.

**Esta decisão não é retrofitável.** Assim que o bucket tiver objetos gravados
sem verificação, não há como distinguir os confiáveis dos envenenados sem
reprocessar tudo — e, no caso de conteúdo compartilhado, sem saber quem foi
afetado. É por isso que ela é registrada antes de existir uma linha do código
de upload.

## Alternativas descartadas

**Confiar no hash do cliente.** É o comportamento que sai de graça, e é
exatamente o vetor descrito acima.

**Verificar de forma preguiçosa, depois do upload.** Reduz a latência
percebida, mas deixa uma janela em que o objeto envenenado já é servido a
terceiros. Numa falha de segurança de conteúdo compartilhado, a janela é o
problema inteiro.

**Fazer o upload passar pela API**, verificando no fluxo. Resolve o problema e
elimina a quarentena, mas devolve à API o trabalho de intermediar arquivos
grandes — que é a razão de o presigned existir.

**Abandonar o endereçamento por conteúdo.** Elimina o ataque, porque cada
usuário só estraga o próprio arquivo. É a saída correta caso a quarentena se
mostre operacionalmente pesada demais; o custo é o desperdício analisado na
[0013](0013-enderecar-roms-pelo-conteudo.md).
