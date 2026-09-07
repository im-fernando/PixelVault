# Spikes

Código de investigação, guardado como **prova de como um número da ADR foi
obtido**. Nada aqui é dependência do produto.

Regras:

- **É descartável.** Não é importado por `apps/` nem por `packages/`, não entra
  no `pnpm build` e não tem teste. Se quebrar, apaga.
- **Não é exemplo de estilo.** Foi escrito para responder uma pergunta em dias
  contados, não para durar.
- **Não instala nada no workspace.** Os protótipos rodam fora do monorepo, com
  as próprias dependências, para não tocar o `pnpm-lock.yaml`.
- Cada pasta é datada e aponta para a ADR que ela sustenta.

| Spike                                                             | Responde                                                                                                                            |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| [2026-09-m1-runtime-de-emulacao](2026-09-m1-runtime-de-emulacao/) | [ADR 0011](../adr/0011-escolha-do-runtime-de-emulacao.md) e [ADR 0008](../adr/0008-viabilidade-de-conquistas-por-evento-de-jogo.md) |
