# 0002. Usar monólito modular

Data: 2026-09-07
Status: aceita

## Contexto

O PixelVault tem domínios com regras bem distintas: identidade, catálogo,
biblioteca do usuário, progresso de save, sessões de jogo e, mais adiante,
conquistas e rankings. Eles evoluem em ritmos diferentes e têm invariantes
próprios.

O projeto é mantido por uma pessoa, com apoio de IA, e ainda não tem usuário.
Não existe pressão de escala nem necessidade de implantação independente.

Analisamos o `modular-monolith-with-ddd` como referência. São 1.062 arquivos
`.cs` em 47 projetos — para um aplicativo de agendar reuniões. Esse número é o
dado mais importante: é o custo real de aplicar DDD tático, CQRS e mensageria
confiável em todos os módulos.

## Decisão

Uma API única, organizada em módulos de domínio dentro de `apps/api/src/modules/`,
cada um com `domain/`, `application/`, `infrastructure/` e `http/`, e um
`index.ts` como única superfície pública.

Módulos são pastas, não pacotes do workspace. O monorepo tem poucos pacotes.

Achievements e leaderboards não existem como pasta até a M6. Esqueleto vazio
para funcionalidade futura é o mesmo over-engineering que esta decisão evita.

## Consequências

Uma implantação, um banco, uma transação — tudo mais simples de operar e
depurar. As fronteiras existem no código e permitem extrair um módulo depois,
se houver motivo concreto.

Em troca, a fronteira depende de disciplina. Por isso ela é verificada
automaticamente ([0003](0003-fronteiras-de-modulo-verificadas-por-lint.md)):
sem verificação, monólito modular vira monólito e pronto.

A evolução prevista, se e quando doer: primeiro extrair workers e filas para
processamento de conquista e ranking; separar serviço só diante de necessidade
real de escala ou de implantação independente.

## Alternativas descartadas

**Microserviços.** Paga-se latência de rede, consistência eventual,
observabilidade distribuída e complexidade de deploy para resolver um problema
de escala que não temos e talvez nunca tenhamos.

**Monólito sem módulos.** É o que acontece por omissão, e é o que produz o
`services/` de 4.000 linhas em que conquistas conhecem hash de senha.

**Copiar a estrutura completa da referência** (Outbox, Inbox, InternalCommands,
CQRS com stack de leitura separada, container de IoC por módulo). Custo alto e
imediato, benefício que só aparece com time grande e volume real. Adotamos as
fronteiras e as ADRs; o resto entra quando houver dor concreta que o justifique.
