# 0004. Aplicar arquitetura hexagonal apenas nas integrações externas

Data: 2026-09-07
Status: aceita

## Contexto

"Hexagonal em tudo" costuma significar embrulhar o ORM em repositórios que só
repassam chamadas, para uma troca de banco que nunca acontece. O resultado é
uma camada de indireção que precisa ser mantida e não paga nada.

Ao mesmo tempo, o PixelVault tem dependências externas que são genuinamente
instáveis: o runtime de emulação vai mudar (a escolha entre EmulatorJS,
Nostalgist e core direto ainda é um spike aberto), o storage precisa rodar em
MinIO no desenvolvimento e em R2 na produção, e ainda não sabemos qual provedor
de metadados vamos usar.

## Decisão

Definimos portas e adaptadores para quatro pontos, e só para eles:

- **Storage** — S3-compatible: MinIO local, R2 em produção
- **Runtime de emulação** — o contrato `EmulatorAdapter` da M1
- **Provedor de metadados** — IGDB, TheGamesDB, No-Intro
- **RetroAchievements** — se o spike de leitura de memória viabilizar

O banco **não** é porta. Prisma é a persistência, confinado em
`infrastructure/` pela regra de fronteira. Repositório existe onde o domínio
precisa expressar uma consulta em seus próprios termos, não como ritual.

## Consequências

Trocar o core de emulação vira escrever um adaptador, e não reescrever o
player. Rodar contra MinIO no desenvolvimento e R2 na produção não gera um `if`
por ambiente.

Em compensação, assumimos que trocar de banco seria caro. É um risco aceito
conscientemente: PostgreSQL é decisão de longo prazo, e o custo de fingir o
contrário seria pago todo dia.

## Alternativas descartadas

**Repositório para tudo.** Indireção sem cliente. O sinal de que uma porta é
real é existir mais de um adaptador plausível — para o banco, não existe.

**Nenhuma porta, chamando SDK direto.** Amarraria o player ao EmulatorJS
justamente na parte do sistema que mais tem chance de mudar.
