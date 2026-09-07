# 0012. Usar Cloudflare R2 como object storage de produção

Data: 2026-09-07
Status: aceita

## Contexto

ROMs e saves são arquivos binários. Eles não vão para o PostgreSQL: o banco
guarda metadados e referências, e o conteúdo vive em object storage
S3-compatible — já é a porta descrita na
[0004](0004-hexagonal-apenas-nas-integracoes-externas.md), e o `docker-compose`
sobe MinIO local exatamente para o mesmo código rodar nos dois lados.

Falta escolher o provedor de produção. Candidatos considerados: Cloudflare R2,
Backblaze B2 e Garage auto-hospedado.

O perfil de tráfego do PixelVault é peculiar e decide a questão. **ROM e save
são praticamente todo o tráfego do produto** — não há vídeo, imagem pesada nem
API de alto volume. Cada partida aberta baixa uma ROM; cada sessão lê e escreve
save. Em compensação, o **volume armazenado por pessoa é pequeno**: uma
biblioteca de cinquenta ROMs de SNES dá algumas centenas de megabytes, e save
state comprimido tem dezenas de kilobytes.

Ou seja: muitos usuários com pouco dado cada, e leitura intensa. É o oposto do
perfil de arquivo morto.

## Decisão

**Cloudflare R2** em produção. MinIO continua sendo o alvo local, e o Garage
permanece como alternativa viável de auto-hospedagem.

## Consequências

O egress zero do R2 remove a variável que mais assusta neste produto. O
argumento não é o preço de hoje, é a **assimetria de risco**: se o projeto
crescer, a conta de banda continua zero em vez de crescer junto com o sucesso.

Durabilidade deixa de ser nossa. Isso importa mais aqui do que pareceria: o
produto promete progresso sincronizado entre dispositivos, e perder o save de
alguém não é incidente, é a quebra da promessa central.

O gratuito cobre o MVP inteiro, dado o volume por usuário.

Em troca, aceitamos dependência de fornecedor e uma exposição concreta:
**notificação de DMCA vai para a nossa conta**. Se ela derrubar o bucket,
derruba também os saves, que não têm nada de ilícito. O modelo BYOR já
minimiza esse risco (arquivo privado do usuário, nunca servido a terceiros,
catálogo público só de metadados — ver [0006](0006-byor-mais-catalogo-de-metadados.md)),
mas o risco não é zero. Mitigação prática: manter backup dos saves
independente do bucket de ROMs, para que uma ação sobre um não leve o outro.

A decisão é reversível por construção: storage é porta, e os três candidatos
são S3-compatible. Trocar é escrever um adaptador.

## Alternativas descartadas

**Backblaze B2.** Armazenamento mais barato por gigabyte, o que importa com
dezenas de terabytes — volume que este produto não vai ter. Pagaríamos o modelo
de egress dele (livre até 3× o armazenado por mês, depois cobrado) para
economizar num eixo em que quase não gastamos. É a troca errada para um site em
que abrir uma partida é baixar um arquivo.

**Garage auto-hospedado.** Tecnicamente adequado e já operado pelo autor em
outros projetos, o que é familiaridade real e não deve ser descartado de leve.
Reduz a superfície de DMCA, porque a notificação passa a ir para o provedor de
infraestrutura em vez de para a conta do produto.

Foi descartado por causa do custo operacional no ponto errado do projeto:
Garage com durabilidade séria são três nós replicados em máquinas distintas,
com monitoramento e backup. Isso é um cluster de armazenamento distribuído para
manter — num projeto cujo objetivo declarado é aprender desenvolvimento web.
Nó único seria perder o save dos usuários no primeiro disco que falhar.

Continua sendo a saída natural se a exposição legal se mostrar um problema
concreto, ou se o custo do R2 deixar de fazer sentido.

## Pendências antes de fechar

- Confirmar os preços vigentes. O que sustenta esta decisão é o **modelo** de
  egress, não o número, mas o número deve ser conferido.
- Confirmar que o subconjunto de S3 do Garage cobre presigned de upload, caso
  ele venha a ser adotado — ele implementa parte da API, não toda.
