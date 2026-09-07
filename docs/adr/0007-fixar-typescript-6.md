# 0007. Fixar o TypeScript na 6.x

Data: 2026-09-07
Status: aceita

## Contexto

A 7.0 do TypeScript é o compilador reescrito em Go. É consideravelmente mais
rápida e é o que o `pnpm add typescript` instala hoje.

O `typescript-eslint` 8.69 — a versão estável mais recente — declara peer
`typescript >=4.8.4 <6.1.0` e falha na inicialização com "typescript-eslint does
not support TS 7.0". Sem ele não há `pnpm lint`; e é o `lint` que sustenta as
fronteiras de módulo da [0003](0003-fronteiras-de-modulo-verificadas-por-lint.md).

A 6.0.3 é estável e suportada.

## Decisão

TypeScript fixado em `^6.0.3` em todos os pacotes, com `overrides` no
`pnpm-workspace.yaml` para impedir que uma dependência transitiva reintroduza a
7 no grafo.

## Consequências

Abrimos mão do ganho de velocidade da 7 até o ecossistema de lint acompanhar.
Nesta escala de projeto o compilador não é o gargalo, então o custo é baixo.

Ficamos com uma restrição para revisitar: quando o `typescript-eslint` publicar
suporte à 7, remover o override e subir. Enquanto isso, o override é o que
impede a incompatibilidade de voltar em silêncio numa atualização qualquer.

## Alternativas descartadas

**Ficar na 7 e desligar o `typescript-eslint`.** Trocaria a checagem que
sustenta a arquitetura por velocidade de compilação. Barganha ruim.

**Usar a versão canário do `typescript-eslint`.** Não anuncia suporte à 7, e
seria trocar um problema conhecido por um instável.
