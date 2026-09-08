# 0021. Usar Resend para e-mail transacional

Data: 2026-09-08
Status: aceita

## Contexto

A recuperação de senha (issue #51) traz para o projeto uma dependência que
nenhuma outra issue da M2 tinha: um provedor de envio de e-mail. Até aqui a
API só falava com o próprio PostgreSQL; agora ela precisa entregar uma
mensagem na caixa de entrada de alguém que, por definição, não consegue
entrar para receber a informação por outro caminho.

O critério não é preço. Um e-mail transacional que cai em spam é pior que
ausente: quem não recebe nada tenta de novo; quem "recebeu" e não vê passa
meia hora concluindo que o produto está quebrado, e a conta continua perdida.
Volume também não é critério — recuperação de senha de um produto pessoal
cabe com folga no nível gratuito de qualquer provedor da lista. O que decide
é **entregabilidade** e, depois dela, quanto do trabalho de entregabilidade
(SPF, DKIM, DMARC, reputação de IP, tratamento de bounce) o provedor faz por
nós.

Havia também a alternativa de não ter provedor nenhum: SMTP direto de um
servidor próprio. Ela está descartada na seção final — é a pior das opções
justamente no critério que importa.

## Decisão

O provedor de e-mail transacional do PixelVault é o **Resend**.

A integração segue o padrão da [ADR 0004](0004-hexagonal-apenas-nas-integracoes-externas.md):
envio de e-mail é integração externa instável (o provedor pode mudar, e o
ambiente de desenvolvimento não deve falar com ele), então ganha porta no
domínio e adaptador na infraestrutura.

- **Porta**: `identity/domain/envio-de-email.ts` — uma interface com um
  método, `enviar(mensagem)`. O domínio não conhece Resend, HTTP nem chave de
  API.
- **Adaptador de produção**: `identity/infrastructure/email-resend.ts`, sobre
  o SDK oficial `resend`, com a chave em `RESEND_API_KEY`.
- **Adaptador de desenvolvimento**: `identity/infrastructure/email-console.ts`,
  que escreve a mensagem no console com o link de redefinição destacado.

Quem escolhe é a composition root, por `EMAIL_TRANSPORTE`, que tem padrão
derivado do `NODE_ENV`: `resend` em produção, `console` em qualquer outro
ambiente. O padrão por ambiente, e não "usa o Resend se a chave existir", é
deliberado: a chave está presente na máquina de desenvolvimento (é de lá que
se testa a de produção), e um padrão que reagisse à presença dela faria o
desenvolvimento mandar e-mail de verdade para caixas de entrada de verdade
toda vez que alguém rodasse o fluxo. Quem quiser exercitar o adaptador real
localmente troca uma variável e sabe o que está fazendo.

Em produção, `RESEND_API_KEY` é obrigatória: a validação de ambiente recusa
subir sem ela, do mesmo jeito que já recusa sem `SESSION_SECRET`.

### O que esta decisão **não** inclui: verificação de e-mail no cadastro

A issue #51 pede para "decidir junto se a verificação de e-mail no cadastro
entra agora". **Não entra.**

Ter um provedor de e-mail é condição necessária para verificar endereço, mas
não é motivo suficiente. Verificação de e-mail completa é outra funcionalidade
inteira — envio no cadastro, endpoint de confirmação, reenvio com rate limit
próprio, e a decisão de qual ação do produto fica atrás do gate de
"verificado" — e nada disso cabe junto com o fluxo de recuperação sem que os
dois saiam mal feitos.

A consequência é explícita e fica registrada: **a conta continua utilizável
sem verificação de e-mail**, como é desde a #45. Alguém pode se cadastrar com
um endereço que não é seu. O dano hoje é pequeno e limitado, porque o produto
ainda não tem nada de valor atrás da conta que um terceiro queira: sem ROM
enviada, a conta é uma linha em `users`. E o dono real do endereço tem um
caminho de recuperação — este mesmo fluxo: ele pede a redefinição, recebe o
link e passa a ser dono da conta que criaram com o e-mail dele.

Também não é verdade que a recuperação de senha _dependa_ da verificação. Ela
depende do contrário: de o endereço ser a prova de identidade. Se o endereço
não for da pessoa, quem consegue redefinir é o dono do endereço — que é
exatamente o resultado correto.

Os dois gatilhos que devem reabrir esta decisão, e é por isso que ficam
escritos aqui:

1. **Outro e-mail transacional.** No dia em que o produto mandar qualquer
   mensagem que não seja resposta a um pedido explícito (aviso de conquista,
   resumo, novidade), mandar para endereço não verificado passa a queimar
   reputação de domínio com bounce e com queixa de spam de quem nunca pediu
   nada.
2. **O `handle` público da M6.** Perfil em `/u/:handle` com ranking torna
   atraente registrar contas com o e-mail de outra pessoa para ocupar um
   nome — e aí a conta não verificada deixa de ser uma linha inerte.

## Consequências

O projeto ganha a primeira dependência de terceiro no caminho de uma
requisição: a partir daqui existe um fluxo do produto que falha se um serviço
externo estiver fora do ar. A mitigação é o desenho do endpoint, não o
provedor — `POST /api/auth/forgot-password` responde 202 sem esperar o
provedor, e a falha de envio vira log do servidor, nunca resposta diferente
para o cliente (ver [docs/seguranca.md](../seguranca.md)).

Ganhamos uma variável de ambiente que é segredo de verdade (`RESEND_API_KEY`)
e que, ao contrário do `SESSION_SECRET`, tem custo financeiro se vazar: quem a
tiver manda e-mail assinado pelo nosso domínio. Ela nunca vai para arquivo
versionado — o `.env.example` guarda só um placeholder.

Ganhamos também um trabalho de operação que o código não resolve: publicar
SPF, DKIM e DMARC do domínio no DNS antes do primeiro envio de produção. Sem
isso, o provedor entrega para o Gmail e o Gmail manda para o spam — que é
exatamente o problema que esta ADR diz estar resolvendo. O adaptador de
console existe em parte por causa disso: o desenvolvimento não precisa de
domínio verificado para o fluxo inteiro ser exercitável.

Em compensação, trocar de provedor é escrever um arquivo. O adaptador tem uma
função, a porta tem um método, e nenhum caso de uso sabe qual dos dois está
pendurado.

## Alternativas descartadas

**Amazon SES.** A opção mais barata por milheiro, com folga, e a que mais
aparece em stack de AWS. Entregabilidade boa — mas boa _depois_ do trabalho:
o SES entrega o encanamento e deixa a reputação por sua conta, exige sair do
sandbox por ticket antes do primeiro envio para endereço não verificado, e o
tratamento de bounce e de queixa é responsabilidade de quem integra (via SNS,
outro serviço a montar), com a conta suspensa se as taxas passarem do limite.
É a escolha certa para quem manda milhões de mensagens e tem quem cuide
disso; para um fluxo de recuperação de senha, é infraestrutura demais para o
que se ganha.

**Postmark.** Provavelmente a melhor entregabilidade transacional do mercado,
e o único que separa fisicamente o tráfego transacional do de marketing —
justamente a separação que impede uma campanha de queimar a reputação do IP
que entrega o "esqueci minha senha". Foi a alternativa mais difícil de
descartar. Perdeu por dois motivos, nenhum deles técnico-decisivo: não tem
nível gratuito permanente (o teste expira), e o SDK Node é mais antigo e menos
tipado que o do Resend, num projeto onde o TypeScript estrito é a rede de
segurança principal. Se a entregabilidade do Resend decepcionar em produção,
o Postmark é o primeiro lugar para onde olhar — e trocar custa um adaptador.

**SendGrid.** O mais adotado historicamente e o que tem a pior reputação
atual entre os três no critério que definimos: o IP compartilhado carrega
tráfego de marketing em massa de quem quer que esteja no mesmo pool, e há
relato constante de mensagem transacional caindo em spam por vizinhança. IP
dedicado resolve, e custa uma faixa de preço que não faz sentido aqui. A API
também é a mais pesada de usar das quatro.

**SMTP próprio (Postfix num servidor nosso).** Custo zero de assinatura e
custo alto de tudo o mais: reputação de IP construída do zero, listas de
bloqueio para monitorar, PTR reverso, rotação de chave DKIM, e o primeiro
e-mail do domínio novo indo direto para spam por meses. É a alternativa que
falha exatamente no critério da issue.

**Não ter provedor e mostrar o link na tela.** Considerada por meia frase,
porque é o que o adaptador de desenvolvimento faz. Como produto, é um buraco
de segurança e não um atalho: qualquer pessoa que digitasse o e-mail de outra
receberia o link de redefinição na própria tela. O e-mail não é o meio de
entrega do link — ele é a **prova de identidade** do fluxo inteiro.
