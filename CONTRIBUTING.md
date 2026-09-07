# Contribuindo

## Ambiente

Ver [docs/desenvolvimento.md](docs/desenvolvimento.md).

## Fluxo

1. A issue vem de uma milestone. Se não existe issue, abra antes — é onde o
   escopo e o critério de aceite ficam registrados.
2. Branch a partir de `main`: `tipo/NN-descricao-curta`, onde `NN` é o número
   da issue. Exemplo: `feat/22-save-state-local`.
3. Commits no padrão [Conventional Commits](https://www.conventionalcommits.org/),
   em português, com `Refs #NN` no corpo.
4. PR com CI verde. `main` é protegida.

## Mensagem de commit

```
tipo(escopo): resumo no imperativo, minúsculo, sem ponto final

Corpo explicando o porquê, não o quê — o diff já mostra o quê. Se a
mudança envolveu uma decisão não óbvia, ela vai aqui (ou vira ADR, se
restringir o futuro do projeto).

Refs #NN
```

Tipos: `feat`, `fix`, `chore`, `docs`, `test`, `refactor`, `perf`.

## Antes de abrir PR

```bash
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

## Mudanças estruturais

Mexer em fronteira de módulo, em camada ou em dependência externa exige uma
[ADR](docs/adr/README.md). Use o [template](docs/adr/template.md), e preencha
"alternativas descartadas" de verdade — é a seção que mais vale daqui a um ano.
