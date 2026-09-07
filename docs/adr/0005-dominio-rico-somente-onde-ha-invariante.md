# 0005. Usar domínio rico somente onde há invariante

Data: 2026-09-07
Status: aceita

## Contexto

DDD tático aplicado uniformemente transforma um CRUD de catálogo em agregado,
value object, evento de domínio e repositório — para gravar um título e uma
capa. É o principal motor dos 1.062 arquivos do projeto de referência.

Nem todo módulo do PixelVault tem regra a proteger. Alguns têm, e são
exatamente os que sustentam o produto social.

## Decisão

Modelo rico — entidade que protege invariante, value object, comportamento
junto do dado — apenas em:

- **progress** — revisão de save, detecção de conflito, qual versão vence
- **sessions** — playtime plausível, tempo creditado pelo servidor
- **achievements** — regra de desbloqueio, idempotência
- **leaderboards** — elegibilidade, temporada, empate

Modelo anêmico e deliberado em **catalog** e **library**: caso de uso fino
chamando repositório. Não há invariante ali que uma constraint do banco não
proteja melhor.

## Consequências

O esforço de modelagem vai para onde erro custa caro: progresso perdido, XP
indevido, ranking forjado. O CRUD continua CRUD e é lido em dez segundos.

A assimetria precisa estar documentada, senão parece incoerência — e é
justamente por isso que esta ADR existe. Se um dia o catálogo ganhar regra de
verdade (curadoria, moderação, versões de jogo), a decisão é revisitada.

## Alternativas descartadas

**Domínio rico em tudo.** Custo alto e imediato, benefício que só aparece onde
há invariante.

**Domínio anêmico em tudo.** A regra de conflito de save e a de crédito de
playtime acabariam espalhadas entre controller e função de serviço, que é onde
esse tipo de bug se esconde melhor.
