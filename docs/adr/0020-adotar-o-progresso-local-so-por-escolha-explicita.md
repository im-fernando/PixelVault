# 0020. Adotar o progresso local só por escolha explícita, item a item

Data: 2026-09-07
Status: aceita

## Contexto

A M1 entregou SRAM e save state **no navegador**: OPFS quando existe,
IndexedDB como reserva, memória como último recurso
(`apps/web/src/features/player/storage/`). A chave é `romId` + tipo + slot, e
`romId` é o SHA-256 da ROM (ADR 0013) — o mesmo identificador dos dois lados,
por construção. A porta `SaveStorage` não conhece usuário, de propósito.

A M2 entrega conta. Com isso passa a existir um momento novo no produto:
alguém joga sem conta, acumula progresso, e depois se cadastra. Resolver isso
no improviso, dentro do fluxo de login, é como se perde progresso — e perder
progresso é o pior defeito possível num produto cuja promessa central é
justamente não perder.

**O fato que decide metade da pergunta: não existe save na nuvem.** Hoje,
`apps/api/src/modules/progress/` tem só `.gitkeep` em cada camada e um
`index.ts` que exporta vazio; não há tabela de save no schema do Prisma; não há
rota que leia ou escreva progresso. Save na nuvem é a M4 inteira. Criar conta
hoje não pode colidir com nada, porque não há o outro lado da colisão.

Dois outros fatos entram na decisão:

- **O save local é do aparelho, não da conta.** Ele mora no OPFS da origem,
  sem chave de usuário. Quem abrir aquele navegador vê aquele progresso,
  logado ou não, seja quem for.
- **O relógio do save local é o relógio do cliente.** O `updatedAt` de um save
  gravado no navegador vem do `Date.now()` daquela máquina. O projeto já
  recusa creditar playtime por tempo declarado pelo cliente (ADR 0009, M6);
  não há por que confiar nesse mesmo relógio justamente para arbitrar quem
  sobrescreve quem.

## Decisão

**Criar conta não move, não copia e não apaga save local.** Nem hoje, nem
depois da M4. Entrar e sair da conta também não. O progresso do aparelho
continua sendo do aparelho, e continua funcionando igual antes e depois do
cadastro.

Quando a M4 existir, a nuvem ganha o save da conta **ao lado** do local, e a
passagem de um para o outro obedece a quatro regras:

1. **A adoção é oferecida, nunca automática.** Nada sobe para a conta sem
   alguém mandar subir.
2. **A oferta acontece onde o save está: na galeria de slots daquele jogo**,
   não no cadastro. Ali existe miniatura, data e o jogo na tela — o contexto
   que torna a escolha uma escolha. No formulário de cadastro não existe nada
   disso, e a decisão viraria um clique às cegas.
3. **A adoção é cópia, não mudança de lugar.** O save adotado continua no
   aparelho depois de subir. É isto que torna a operação reversível de graça:
   desfazer é continuar jogando pelo local, sem precisar de nenhum caminho de
   restauração da nuvem para o dispositivo.
4. **A nuvem nunca é sobrescrita sem escolha explícita daquele item.** Slot da
   nuvem vazio, a adoção é um clique. Slot ocupado, a interface mostra os dois
   lados — data, miniatura, tamanho — e exige escolha, com "manter o da
   nuvem" já marcado. Não existe resolução automática por "o mais recente
   vence": o "mais recente" do lado local é uma data que o navegador escreveu
   sobre si mesmo. (A porta já aceita `updatedAt` de fora, em vez de chamar
   `Date.now()` por conta própria, justamente para a M4 poder carimbar o
   relógio do servidor no que subir — ver `save-record.ts`.)

Isto é a promessa que a M4 tem que cumprir. **Nada disso é implementado
agora** — não há o que reconciliar contra um backend que não existe, e
escrever a metade cliente de uma conversa cujo outro lado ainda não foi
desenhado é escrever código que a M4 vai jogar fora.

O que fica implementado hoje é a garantia de que o comportamento não muda por
acidente. Duas travas, e elas pegam coisas diferentes: uma regra de fronteira
no `.dependency-cruiser.cjs` (`sessao-nao-toca-save-local`, nos dois sentidos)
deixa o CI vermelho se alguém ligar o storage de save local à sessão por
import; e `save-sobrevive-a-conta.test.ts` grava SRAM e save state, roda o
mesmo fluxo de cadastro que a tela roda, e exige que os bytes continuem lá. É
exatamente a forma que teria "limpar os saves no logout" ou "adotar tudo no
cadastro" entrando no código sem passar por esta decisão.

E o texto da tela de cadastro, que prometia "com conta, o progresso fica onde
você deixou — em qualquer aparelho", passa a dizer a verdade de hoje: o save
fica neste aparelho, e criar conta não mexe nele. Sem caixa nova, sem passo
novo, sem tela nova — a mesma linha de nota que já existia. Um aviso extra no
cadastro seria ruído: informa sobre uma migração que ainda não é possível
fazer, num formulário deliberadamente sem fricção (#50), e a pessoa não tem o
que decidir com essa informação.

## Consequências

Quem jogar sem conta no celular e se cadastrar ali não vai encontrar aquele
progresso no PC — nem agora, nem no dia seguinte à M4, porque mesmo depois
dela a subida depende de alguém clicar. Isso dói, e é o preço: sincronia que
não é automática é sincronia que a pessoa esquece de ligar. Aceitamos porque
o modo de falha do outro lado (a adoção silenciosa que sobe o save errado, ou
que sobrescreve o certo) é irreversível, e este é reversível — basta abrir a
galeria e mandar subir.

A M4 herda trabalho que a adoção silenciosa não teria: listar o que existe no
aparelho, ler miniatura sem arrastar os bytes (a porta já prevê isso, com
`readThumbnail`), desenhar os dois lados de uma colisão e guardar a escolha.
É trabalho de interface, e é onde a decisão vira produto.

Depois da M4, o mesmo save passa a existir em dois lugares e a ocupar espaço
duas vezes no aparelho. Um save state do SNES tem centenas de KB e a cota de
OPFS se mede em centenas de MB, então isso não aperta tão cedo — mas é
duplicação real, e ninguém vai limpá-la sozinho.

Fica de pé um incômodo que esta decisão **não** resolve: em navegador
compartilhado, o save local de um continua visível para o outro. Resolver
isso exigiria chavear o save local por usuário, o que a porta recusa e o que
deixaria órfão todo save feito antes de existir conta. O que a decisão evita é
o agravamento: sem adoção silenciosa, o progresso de outra pessoa nunca entra
na sua conta de forma permanente por você ter se cadastrado naquele
computador.

E a tela de cadastro perde argumento: a promessa mais forte que ela tinha para
oferecer era a sincronia, e agora ela promete só o que entrega. Até a M4, o
motivo de criar conta é o acervo (M3), não o save.

## Alternativas descartadas

**Adotar o progresso local silenciosamente ao criar conta.** É a opção que
parece gentil e é a mais perigosa das três. Em navegador compartilhado, ela
carrega para a sua conta o progresso de outra pessoa, permanentemente, sem
ninguém ter pedido. Depois da M4 ela precisa de uma regra automática de
colisão, e toda regra automática aqui arbitra por relógio do cliente — o
mesmo relógio que o projeto se recusa a usar para creditar playtime. E, por
ser silenciosa, só é descoberta quando dá errado, que é precisamente onde a
promessa central do produto mora.

**Oferecer a adoção dentro do fluxo de cadastro** ("achamos progresso neste
aparelho, quer trazer?"). Descartada por ser o pior momento possível para
essa escolha: a pessoa está preenchendo uma ficha para entrar, não tem o jogo
na tela, não lembra o que é o slot 3, não vê miniatura nem data, e tem um
clique para decidir sobre tudo de uma vez. A oferta vale, mas vale na galeria
de slots — e a #50 construiu um cadastro deliberadamente direto, no qual um
assistente de migração na porta de entrada é exatamente a fricção que foi
evitada.

**Resolver colisão pelo save mais recente.** Descartada duas vezes. Primeiro
porque a data do lado local é a data que aquele navegador acha que é: aparelho
com bateria de relógio morta, fuso trocado à mão, e o "mais recente" mente.
Segundo porque, mesmo com relógios corretos, "mais recente" não é o critério
certo para save state — o mais novo costuma ser o de dez segundos antes de
morrer, e o que a pessoa quer é o de antes.

**Mover o save local para a nuvem, apagando o do aparelho.** Descartada
porque tornaria a adoção destrutiva e obrigaria a M4 a construir o caminho de
volta (nuvem → aparelho) só para poder desfazer. Copiar deixa o desfazer
pronto sem uma linha a mais.

**Chavear o save local por usuário** (o storage local passar a conhecer a
conta). Descartada porque quebra o contrato da porta, que existe para ser
trocada por rede na M4 e não para ganhar um eixo de usuário no cliente; porque
deixaria órfão todo save gravado antes de existir conta, que é justamente o
progresso de que esta issue trata; e porque não resolve nada hoje — quem
precisa de saves separados no mesmo computador tem perfil de navegador.

**Abrir a M4 adiantada aqui**: criar a tabela de progresso e uma rota de
upload de save só para poder implementar a adoção nesta issue. Descartada
explicitamente. A decisão cabe numa ADR; a implementação é uma milestone
inteira, com perguntas próprias que esta issue não tem contexto para
responder — cota de save por usuário, tamanho máximo, o que acontece quando a
ROM daquele save não está na biblioteca da conta, e o conflito entre
dispositivos que é a M5. Antecipar meia M4 aqui entregaria justamente a metade
que a M5 teria que renegociar.
